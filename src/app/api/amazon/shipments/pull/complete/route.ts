import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";
import { AmazonSpApiClient } from "@/lib/amazon-sp-api";
import { parseShipmentReport } from "@/lib/amazon-shipments-parser";

export const dynamic = "force-dynamic";

/**
 * Step 3: Download the completed report, parse it, and save to DB.
 * Called after polling confirms the report is DONE.
 */
export async function POST(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;

    const body = await req.json();
    const { reportDocumentId, startDate, endDate } = body;

    if (!reportDocumentId) {
      return NextResponse.json(
        { error: "reportDocumentId is required" },
        { status: 400 }
      );
    }

    const client = await AmazonSpApiClient.forOrganization(orgId);

    // Download the flat file
    const rawText = await client.downloadShipmentReport(reportDocumentId);

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "Report returned empty — no shipments in this date range" },
        { status: 404 }
      );
    }

    // Parse using the existing parser
    const report = parseShipmentReport(rawText);

    if (report.shipmentCount === 0) {
      return NextResponse.json(
        { error: "No shipments found in this date range" },
        { status: 404 }
      );
    }

    // Save to DB with source="api" and syncStatus="pending" (no auto-sync)
    const saved = await db.shipmentReport.create({
      data: {
        organizationId: orgId,
        reportDate:
          report.startDate && report.endDate
            ? `${report.startDate} to ${report.endDate}`
            : null,
        startDate: report.startDate || startDate || null,
        endDate: report.endDate || endDate || null,
        shipmentCount: report.shipmentCount,
        totalAmount: report.totalAmount,
        currency: report.currency,
        shipments: report.shipments as any,
        source: "api",
        syncStatus: "pending",
      },
    });

    // Check for unmapped SKUs
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
    console.error("Pull shipment report (complete) error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to download and save shipment report" },
      { status: 500 }
    );
  }
}
