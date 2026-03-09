import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/amazon/shipments/append
 * Append additional shipments to an existing saved report (for large reports
 * that need to be saved in batches due to request size limits).
 * Body: { reportId: string, shipments: any[] }
 */
export async function POST(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;
    const { reportId, shipments } = await req.json();

    if (!reportId || !shipments || !Array.isArray(shipments)) {
      return NextResponse.json(
        { error: "reportId and shipments array are required" },
        { status: 400 }
      );
    }

    const report = await db.shipmentReport.findUnique({
      where: { id: reportId },
    });

    if (!report || report.organizationId !== orgId) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // Append shipments to existing array
    const existingShipments = (report.shipments as any[]) || [];
    const updatedShipments = [...existingShipments, ...shipments];

    await db.shipmentReport.update({
      where: { id: reportId },
      data: {
        shipments: updatedShipments,
        shipmentCount: updatedShipments.length,
      },
    });

    return NextResponse.json({ success: true, shipmentCount: updatedShipments.length });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Append shipments error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to append shipments" },
      { status: 500 }
    );
  }
}
