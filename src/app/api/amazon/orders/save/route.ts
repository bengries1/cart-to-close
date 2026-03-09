import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;
    const body = await req.json();
    const { report } = body;

    if (!report || !report.orders || !Array.isArray(report.orders)) {
      return NextResponse.json(
        { error: "Invalid order report data" },
        { status: 400 }
      );
    }

    const saved = await db.orderReport.create({
      data: {
        organizationId: orgId,
        reportDate: report.startDate && report.endDate
          ? `${report.startDate} to ${report.endDate}`
          : null,
        startDate: report.startDate || null,
        endDate: report.endDate || null,
        orderCount: report.orderCount || report.orders.length,
        totalAmount: report.totalAmount || 0,
        currency: report.currency || "USD",
        orders: report.orders,
        source: "upload",
      },
    });

    // Check for SKUs not yet in item mappings
    const allSkus = new Set<string>();
    for (const order of report.orders) {
      for (const item of order.items || []) {
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
      unmappedSkus,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Save order report error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save order report" },
      { status: 500 }
    );
  }
}
