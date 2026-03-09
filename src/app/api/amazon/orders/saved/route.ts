import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireOrg();

    const reports = await db.orderReport.findMany({
      where: { organizationId: session.user.organizationId },
      select: {
        id: true,
        reportDate: true,
        startDate: true,
        endDate: true,
        orderCount: true,
        totalAmount: true,
        currency: true,
        syncStatus: true,
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
    console.error("List saved order reports error:", err);
    return NextResponse.json(
      { error: "Failed to load saved reports" },
      { status: 500 }
    );
  }
}

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

    const report = await db.orderReport.findUnique({
      where: { id: reportId },
    });

    if (!report || report.organizationId !== session.user.organizationId) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    await db.orderReport.delete({ where: { id: reportId } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Delete order report error:", err);
    return NextResponse.json(
      { error: "Failed to delete report" },
      { status: 500 }
    );
  }
}
