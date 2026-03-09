import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/amazon/fee-types
 * Returns all unique fee type keys discovered from saved settlement reports
 * that are NOT in the standard AMAZON_FEE_TYPES list.
 */
export async function GET() {
  try {
    const session = await requireOrg();

    const reports = await db.settlementReport.findMany({
      where: { organizationId: session.user.organizationId },
      select: { fees: true },
    });

    // Collect all unique fee keys from saved reports
    const discoveredKeys = new Set<string>();
    for (const report of reports) {
      const fees = report.fees as Array<{
        amountType: string;
        amountDescription: string;
      }>;
      for (const fee of fees) {
        const key = fee.amountDescription || fee.amountType;
        if (key) discoveredKeys.add(key);
      }
    }

    return NextResponse.json({
      feeTypes: Array.from(discoveredKeys).sort(),
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Get discovered fee types error:", err);
    return NextResponse.json(
      { error: "Failed to load fee types" },
      { status: 500 }
    );
  }
}
