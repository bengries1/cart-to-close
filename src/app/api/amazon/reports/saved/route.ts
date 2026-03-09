import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/amazon/reports/saved
 * List saved settlement reports for this org (summary only, no transactions).
 */
export async function GET() {
  try {
    const session = await requireOrg();

    const reports = await db.settlementReport.findMany({
      where: { organizationId: session.user.organizationId },
      select: {
        id: true,
        settlementId: true,
        settlementStartDate: true,
        settlementEndDate: true,
        depositDate: true,
        totalAmount: true,
        currency: true,
        transactionCount: true,
        fees: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ reports });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("List saved reports error:", err);
    return NextResponse.json(
      { error: "Failed to load saved reports" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/amazon/reports/saved?id=xxx
 * Delete a saved settlement report.
 */
export async function DELETE(req: Request) {
  try {
    const session = await requireOrg();

    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get("id");

    if (!reportId) {
      return NextResponse.json(
        { error: "Report ID is required" },
        { status: 400 }
      );
    }

    const report = await db.settlementReport.findUnique({
      where: { id: reportId },
    });

    if (!report || report.organizationId !== session.user.organizationId) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    await db.settlementReport.delete({ where: { id: reportId } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Delete saved report error:", err);
    return NextResponse.json(
      { error: "Failed to delete report" },
      { status: 500 }
    );
  }
}
