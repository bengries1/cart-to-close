import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";
import { AmazonSpApiClient } from "@/lib/amazon-sp-api";
import { parseShipmentReport } from "@/lib/amazon-shipments-parser";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // allow up to 5 min for report generation

export async function POST(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;

    const body = await req.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required (ISO format)" },
        { status: 400 }
      );
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }
    if (end < start) {
      return NextResponse.json(
        { error: "endDate must be after startDate" },
        { status: 400 }
      );
    }

    // Get the Amazon connection for this org
    const client = await AmazonSpApiClient.forOrganization(orgId);

    // 1. Request the report
    const reportId = await client.createShipmentReport({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });

    // 2. Poll until done
    const reportDocumentId = await client.waitForReport(reportId);

    // 3. Download the flat file
    const rawText = await client.downloadShipmentReport(reportDocumentId);

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "Report returned empty — no shipments in this date range" },
        { status: 404 }
      );
    }

    // 4. Parse it using the existing parser
    const report = parseShipmentReport(rawText);

    if (report.shipmentCount === 0) {
      return NextResponse.json(
        { error: "No shipments found in this date range" },
        { status: 404 }
      );
    }

    // 5. Save to DB with source="api" and syncStatus="pending" (no auto-sync)
    const saved = await db.shipmentReport.create({
      data: {
        organizationId: orgId,
        reportDate:
          report.startDate && report.endDate
            ? `${report.startDate} to ${report.endDate}`
            : null,
        startDate: report.startDate || startDate,
        endDate: report.endDate || endDate,
        shipmentCount: report.shipmentCount,
        totalAmount: report.totalAmount,
        currency: report.currency,
        shipments: report.shipments as any,
        source: "api",
        syncStatus: "pending",
      },
    });

    // 6. Check for unmapped SKUs
    const allSkus = new Set<string>();
    for (const shipment of report.shipments) {
      for (const item of shipment.items || []) {
        if (item.sku) allSkus.add(item.sku);
      }
    }

    const existingMappings = await db.itemMapping.findMany({
      where: { organizationId: orgId },
      select: { amazonSku: true },
    });
    const mappedSkus = new Set(existingMappings.map((m: any) => m.amazonSku));
    const unmappedSkus = Array.from(allSkus).filter(
      (sku) => !mappedSkus.has(sku)
    );

    return NextResponse.json({
      success: true,
      reportId: saved.id,
      shipmentCount: report.shipmentCount,
      totalAmount: report.totalAmount,
      currency: report.currency,
      startDate: report.startDate,
      endDate: report.endDate,
      unmappedSkus,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (err.message?.includes("Amazon connection not found")) {
      return NextResponse.json(
        { error: "No active Amazon connection. Connect your account in Settings first." },
        { status: 400 }
      );
    }
    console.error("Pull shipment report error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to pull shipment report from Amazon" },
      { status: 500 }
    );
  }
}
