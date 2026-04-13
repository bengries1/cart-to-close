import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { AmazonSpApiClient } from "@/lib/amazon-sp-api";

export const dynamic = "force-dynamic";

/**
 * Step 2: Poll the report status.
 * Returns processingStatus and reportDocumentId when DONE.
 */
export async function GET(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;

    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get("reportId");

    if (!reportId) {
      return NextResponse.json(
        { error: "reportId is required" },
        { status: 400 }
      );
    }

    const client = await AmazonSpApiClient.forOrganization(orgId);
    const status = await client.getReportStatus(reportId);

    return NextResponse.json({
      processingStatus: status.processingStatus,
      reportDocumentId: status.reportDocumentId || null,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Pull shipment report (status) error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to check report status" },
      { status: 500 }
    );
  }
}
