import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { AmazonSpApiClient } from "@/lib/amazon-sp-api";

export const dynamic = "force-dynamic";

// GET /api/amazon/reports — list available settlement reports
export async function GET(req: Request) {
  try {
    const session = await requireOrg();

    const { searchParams } = new URL(req.url);
    const pageSize = parseInt(searchParams.get("pageSize") || "10", 10);
    const nextToken = searchParams.get("nextToken") || undefined;
    const createdSince = searchParams.get("createdSince") || undefined;
    const createdUntil = searchParams.get("createdUntil") || undefined;

    const client = await AmazonSpApiClient.forOrganization(
      session.user.organizationId
    );

    const result = await client.listSettlementReports({
      pageSize,
      nextToken,
      createdSince,
      createdUntil,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (
      err.message?.includes("not found") ||
      err.message?.includes("No active Amazon")
    ) {
      return NextResponse.json(
        { error: "No Amazon connection found. Connect your account in Settings." },
        { status: 404 }
      );
    }
    console.error("List settlement reports error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch reports" },
      { status: 500 }
    );
  }
}

// POST /api/amazon/reports — download & parse a specific report
// Body: { reportDocumentId: string }
export async function POST(req: Request) {
  try {
    const session = await requireOrg();

    const body = await req.json();
    const { reportDocumentId } = body;

    if (!reportDocumentId || typeof reportDocumentId !== "string") {
      return NextResponse.json(
        { error: "reportDocumentId is required" },
        { status: 400 }
      );
    }

    const client = await AmazonSpApiClient.forOrganization(
      session.user.organizationId
    );

    const report = await client.downloadSettlementReport(reportDocumentId);

    return NextResponse.json({ report });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (
      err.message?.includes("not found") ||
      err.message?.includes("No active Amazon")
    ) {
      return NextResponse.json(
        { error: "No Amazon connection found. Connect your account in Settings." },
        { status: 404 }
      );
    }
    console.error("Download settlement report error:", err);
    return NextResponse.json(
      { error: "Failed to download report" },
      { status: 500 }
    );
  }
}
