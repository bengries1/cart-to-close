import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/amazon/orders/append
 * Append additional orders to an existing saved report (for large reports
 * that need to be saved in batches due to request size limits).
 * Body: { reportId: string, orders: any[] }
 */
export async function POST(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;
    const { reportId, orders } = await req.json();

    if (!reportId || !orders || !Array.isArray(orders)) {
      return NextResponse.json(
        { error: "reportId and orders array are required" },
        { status: 400 }
      );
    }

    const report = await db.orderReport.findUnique({
      where: { id: reportId },
    });

    if (!report || report.organizationId !== orgId) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // Append orders to existing array
    const existingOrders = (report.orders as any[]) || [];
    const updatedOrders = [...existingOrders, ...orders];

    await db.orderReport.update({
      where: { id: reportId },
      data: {
        orders: updatedOrders,
        orderCount: updatedOrders.length,
      },
    });

    return NextResponse.json({ success: true, orderCount: updatedOrders.length });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Append orders error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to append orders" },
      { status: 500 }
    );
  }
}
