import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * GET /api/netsuite/fee-mappings
 * Returns all fee mappings for this org.
 */
export async function GET() {
  try {
    const session = await requireOrg();

    const mappings = await db.feeMapping.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: { amazonFeeType: "asc" },
    });

    return NextResponse.json({ mappings });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Get fee mappings error:", err);
    return NextResponse.json(
      { error: "Failed to load fee mappings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/netsuite/fee-mappings
 * Bulk upsert fee mappings.
 * Body: { mappings: Array<{ amazonFeeType, netSuiteAccountId, netSuiteAccountName? }> }
 */
export async function PUT(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;

    const body = await req.json();
    const { mappings } = body;

    if (!Array.isArray(mappings)) {
      return NextResponse.json(
        { error: "mappings must be an array" },
        { status: 400 }
      );
    }

    // Validate each mapping
    for (const m of mappings) {
      if (!m.amazonFeeType || typeof m.amazonFeeType !== "string") {
        return NextResponse.json(
          { error: "Each mapping must have an amazonFeeType" },
          { status: 400 }
        );
      }
      if (!m.netSuiteAccountId || typeof m.netSuiteAccountId !== "string") {
        return NextResponse.json(
          { error: `Missing NetSuite account for ${m.amazonFeeType}` },
          { status: 400 }
        );
      }
    }

    // Upsert all mappings in a transaction
    await db.$transaction(
      mappings.map((m: any) =>
        db.feeMapping.upsert({
          where: {
            organizationId_amazonFeeType: {
              organizationId: orgId,
              amazonFeeType: m.amazonFeeType,
            },
          },
          update: {
            netSuiteAccountId: m.netSuiteAccountId,
            netSuiteAccountName: m.netSuiteAccountName || null,
          },
          create: {
            organizationId: orgId,
            amazonFeeType: m.amazonFeeType,
            netSuiteAccountId: m.netSuiteAccountId,
            netSuiteAccountName: m.netSuiteAccountName || null,
          },
        })
      )
    );

    return NextResponse.json({ success: true, count: mappings.length });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Save fee mappings error:", err);
    return NextResponse.json(
      { error: "Failed to save fee mappings" },
      { status: 500 }
    );
  }
}
