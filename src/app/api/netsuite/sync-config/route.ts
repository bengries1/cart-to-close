import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * GET /api/netsuite/sync-config
 * Returns the sync configuration for this org.
 */
export async function GET() {
  try {
    const session = await requireOrg();

    const config = await db.syncConfig.findUnique({
      where: { organizationId: session.user.organizationId },
    });

    return NextResponse.json({ config: config || null });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Get sync config error:", err);
    return NextResponse.json(
      { error: "Failed to load sync configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/netsuite/sync-config
 * Upsert sync configuration.
 */
export async function PUT(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;

    const body = await req.json();

    const {
      defaultCustomerId,
      defaultCustomerName,
      defaultSubsidiaryId,
      defaultSubsidiaryName,
      defaultPaymentMethodId,
      defaultPaymentMethodName,
      defaultTaxCodeId,
      defaultTaxCodeName,
      invoiceGrouping,
    } = body;

    // Validate invoiceGrouping
    if (
      invoiceGrouping &&
      invoiceGrouping !== "per_order" &&
      invoiceGrouping !== "per_settlement"
    ) {
      return NextResponse.json(
        { error: "invoiceGrouping must be 'per_order' or 'per_settlement'" },
        { status: 400 }
      );
    }

    const data = {
      defaultCustomerId: defaultCustomerId || null,
      defaultCustomerName: defaultCustomerName || null,
      defaultSubsidiaryId: defaultSubsidiaryId || null,
      defaultSubsidiaryName: defaultSubsidiaryName || null,
      defaultPaymentMethodId: defaultPaymentMethodId || null,
      defaultPaymentMethodName: defaultPaymentMethodName || null,
      defaultTaxCodeId: defaultTaxCodeId || null,
      defaultTaxCodeName: defaultTaxCodeName || null,
      invoiceGrouping: invoiceGrouping || "per_order",
    };

    const config = await db.syncConfig.upsert({
      where: { organizationId: orgId },
      update: data,
      create: { organizationId: orgId, ...data },
    });

    return NextResponse.json({ success: true, config });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Save sync config error:", err);
    return NextResponse.json(
      { error: "Failed to save sync configuration" },
      { status: 500 }
    );
  }
}
