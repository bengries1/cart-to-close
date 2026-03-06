import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/netsuite/item-mappings
 * Returns all item mappings for this org.
 */
export async function GET() {
  try {
    const session = await requireOrg();

    const mappings = await db.itemMapping.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: { amazonSku: "asc" },
    });

    return NextResponse.json({ mappings });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Get item mappings error:", err);
    return NextResponse.json(
      { error: "Failed to load item mappings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/netsuite/item-mappings
 * Bulk upsert item mappings.
 * Body: { mappings: Array<{ amazonSku, amazonTitle?, netSuiteItemId, netSuiteItemName? }> }
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

    for (const m of mappings) {
      if (!m.amazonSku || typeof m.amazonSku !== "string") {
        return NextResponse.json(
          { error: "Each mapping must have an amazonSku" },
          { status: 400 }
        );
      }
      if (!m.netSuiteItemId || typeof m.netSuiteItemId !== "string") {
        return NextResponse.json(
          { error: `Missing NetSuite item for SKU ${m.amazonSku}` },
          { status: 400 }
        );
      }
    }

    await db.$transaction(
      mappings.map((m: any) =>
        db.itemMapping.upsert({
          where: {
            organizationId_amazonSku: {
              organizationId: orgId,
              amazonSku: m.amazonSku,
            },
          },
          update: {
            amazonTitle: m.amazonTitle || null,
            netSuiteItemId: m.netSuiteItemId,
            netSuiteItemName: m.netSuiteItemName || null,
          },
          create: {
            organizationId: orgId,
            amazonSku: m.amazonSku,
            amazonTitle: m.amazonTitle || null,
            netSuiteItemId: m.netSuiteItemId,
            netSuiteItemName: m.netSuiteItemName || null,
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
    console.error("Save item mappings error:", err);
    return NextResponse.json(
      { error: "Failed to save item mappings" },
      { status: 500 }
    );
  }
}
