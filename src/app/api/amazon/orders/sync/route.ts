import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";
import { syncOrdersToNetSuite } from "@/lib/netsuite-sales-orders";

export const dynamic = "force-dynamic";

/**
 * POST /api/amazon/orders/sync
 * Sync a saved order report to NetSuite as Sales Orders.
 * Body: { reportId: string }
 */
export async function POST(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;
    const { reportId } = await req.json();

    if (!reportId) {
      return NextResponse.json(
        { error: "reportId is required" },
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

    if (report.syncStatus === "syncing") {
      return NextResponse.json(
        { error: "Sync already in progress" },
        { status: 409 }
      );
    }

    // Create sync job
    const syncJob = await db.syncJob.create({
      data: {
        organizationId: orgId,
        jobType: "orders_to_netsuite",
        status: "running",
        startedAt: new Date(),
      },
    });

    // Mark report as syncing
    await db.orderReport.update({
      where: { id: reportId },
      data: { syncStatus: "syncing", syncJobId: syncJob.id },
    });

    // Run sync
    const orders = report.orders as any[];
    const result = await syncOrdersToNetSuite(orgId, orders, syncJob.id);

    // Update sync job status
    const finalStatus =
      result.failed === 0
        ? "completed"
        : result.created > 0
          ? "completed"
          : "failed";

    await db.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        recordsProcessed: result.created,
        errorMessage:
          result.errors.length > 0
            ? `${result.failed} failed: ${result.errors[0].error}`
            : null,
      },
    });

    // Update report sync status
    const reportStatus =
      result.failed === 0
        ? "synced"
        : result.created > 0
          ? "partial"
          : "failed";

    await db.orderReport.update({
      where: { id: reportId },
      data: { syncStatus: reportStatus },
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Sync orders error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to sync orders" },
      { status: 500 }
    );
  }
}
