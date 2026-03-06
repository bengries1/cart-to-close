import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * GET /api/dashboard/stats
 * Returns dashboard data: connection status, sync job history, and
 * cached settlement summary (if available).
 */
export async function GET() {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;

    // Run all queries in parallel
    const [
      amazonConn,
      netsuiteConn,
      recentSyncJobs,
      totalSyncedRecords,
      settlementCache,
    ] = await Promise.all([
      // Amazon connection status
      db.amazonConnection.findFirst({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, sellerId: true, updatedAt: true },
      }),

      // NetSuite connection status
      db.netSuiteConnection.findFirst({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, accountId: true, updatedAt: true },
      }),

      // Last 10 sync jobs
      db.syncJob.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          jobType: true,
          status: true,
          recordsProcessed: true,
          startedAt: true,
          completedAt: true,
          errorMessage: true,
          createdAt: true,
        },
      }),

      // Total synced records (all completed jobs)
      db.syncJob.aggregate({
        where: { organizationId: orgId, status: "completed" },
        _sum: { recordsProcessed: true },
      }),

      // Cached settlement summary (populated when user views a report)
      db.netSuiteCache.findUnique({
        where: {
          organizationId_cacheKey: {
            organizationId: orgId,
            cacheKey: "settlementSummary",
          },
        },
      }),
    ]);

    return NextResponse.json({
      connections: {
        amazon: amazonConn
          ? { connected: true, sellerId: amazonConn.sellerId, updatedAt: amazonConn.updatedAt }
          : { connected: false },
        netsuite: netsuiteConn
          ? { connected: true, accountId: netsuiteConn.accountId, updatedAt: netsuiteConn.updatedAt }
          : { connected: false },
      },
      syncJobs: recentSyncJobs,
      totalSyncedRecords: totalSyncedRecords._sum.recordsProcessed || 0,
      settlementSummary: settlementCache
        ? (settlementCache.data as any)
        : null,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Dashboard stats error:", err);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard/stats
 * Cache settlement summary data for the dashboard.
 * Body: { revenue, fees, netDeposit, dailySales, feeBreakdown }
 */
export async function POST(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;

    const body = await req.json();

    await db.netSuiteCache.upsert({
      where: {
        organizationId_cacheKey: {
          organizationId: orgId,
          cacheKey: "settlementSummary",
        },
      },
      update: {
        data: body as any,
        fetchedAt: new Date(),
      },
      create: {
        organizationId: orgId,
        cacheKey: "settlementSummary",
        data: body as any,
        fetchedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Cache settlement summary error:", err);
    return NextResponse.json(
      { error: "Failed to cache settlement data" },
      { status: 500 }
    );
  }
}
