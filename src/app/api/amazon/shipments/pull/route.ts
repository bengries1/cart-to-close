import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { AmazonSpApiClient } from "@/lib/amazon-sp-api";

export const dynamic = "force-dynamic";

/**
 * Step 1: Request Amazon to generate the shipment report.
 * Returns a reportId for polling.
 */
export async function POST(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;

    const body = await req.json();
    const { startDate, endDate, timezone } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json(
        { error: "Dates must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    if (endDate < startDate) {
      return NextResponse.json(
        { error: "endDate must be after startDate" },
        { status: 400 }
      );
    }

    const tzOffsets: Record<string, number> = {
      "America/Los_Angeles": -8,
      "America/Denver": -7,
      "America/Chicago": -6,
      "America/New_York": -5,
      "UTC": 0,
    };
    const tz = timezone || "America/Los_Angeles";
    const offsetHours = tzOffsets[tz] ?? -8;

    const offsetStr =
      offsetHours === 0
        ? "Z"
        : `${offsetHours < 0 ? "-" : "+"}${String(Math.abs(offsetHours)).padStart(2, "0")}:00`;
    const startISO = `${startDate}T00:00:00${offsetStr}`;
    const endISO = `${endDate}T23:59:59${offsetStr}`;

    const client = await AmazonSpApiClient.forOrganization(orgId);

    const reportId = await client.createShipmentReport({
      startDate: startISO,
      endDate: endISO,
    });

    return NextResponse.json({ reportId });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (err.message?.includes("Amazon connection not found")) {
      return NextResponse.json(
        { error: "No active Amazon connection. Connect your account in Settings first." },
        { status: 400 }
      );
    }
    console.error("Pull shipment report (start) error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to request shipment report from Amazon" },
      { status: 500 }
    );
  }
}
