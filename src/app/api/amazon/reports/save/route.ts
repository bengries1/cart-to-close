import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Standard Amazon fee type keys (from the fee-mappings page)
const STANDARD_FEE_KEYS = new Set([
  "Commission",
  "FBAPerUnitFulfillmentFee",
  "FBAPerOrderFulfillmentFee",
  "FBAWeightBasedFee",
  "FBAInventoryStorageFee",
  "FBALongTermStorageFee",
  "FBARemovalFee",
  "FBADisposalFee",
  "FBAInboundTransportationFee",
  "FBACustomerReturnPerUnitFee",
  "ShippingChargeback",
  "ShippingHB",
  "FixedClosingFee",
  "VariableClosingFee",
  "RefundCommission",
  "GiftwrapChargeback",
  "PromotionShipping",
  "SalesTaxCollectionFee",
  "MarketplaceFacilitatorTax",
  "SubscriptionFee",
  "AdvertisingFee",
  "HighVolumeListingFee",
  "ProductSales",
  "ProductSalesTax",
  "ShippingCredits",
  "GiftWrapCredits",
  "PromotionalRebates",
  "OtherTransactionFees",
  "Other",
]);

interface FeeSummary {
  amountType: string;
  amountDescription: string;
  totalAmount: number;
  transactionCount: number;
}

/**
 * POST /api/amazon/reports/save
 * Save a parsed settlement report to the database and detect new fee types.
 * Body: { report: SettlementReport }
 */
export async function POST(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;
    const body = await req.json();
    const { report } = body;

    if (!report || !report.fees || !report.transactions) {
      return NextResponse.json(
        { error: "Invalid report data" },
        { status: 400 }
      );
    }

    // Check for duplicate settlement ID
    if (report.settlementId) {
      const existing = await db.settlementReport.findUnique({
        where: {
          organizationId_settlementId: {
            organizationId: orgId,
            settlementId: report.settlementId,
          },
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: `Settlement #${report.settlementId} has already been saved.` },
          { status: 409 }
        );
      }
    }

    // Save the report
    const saved = await db.settlementReport.create({
      data: {
        organizationId: orgId,
        settlementId: report.settlementId || null,
        settlementStartDate: report.settlementStartDate || null,
        settlementEndDate: report.settlementEndDate || null,
        depositDate: report.depositDate || null,
        totalAmount: report.totalAmount || 0,
        currency: report.currency || "USD",
        transactionCount: report.transactions.length,
        fees: report.fees,
        transactions: report.transactions,
        source: "upload",
      },
    });

    // Detect new fee types not in the standard list
    const fees: FeeSummary[] = report.fees;
    const reportFeeKeys = new Set<string>();
    for (const fee of fees) {
      // Use amountDescription as primary key (matches standard list),
      // fall back to amountType if description is empty
      const key = fee.amountDescription || fee.amountType;
      if (key) reportFeeKeys.add(key);
    }

    // Get existing fee mappings for this org
    const existingMappings = await db.feeMapping.findMany({
      where: { organizationId: orgId },
      select: { amazonFeeType: true },
    });
    const existingKeys = new Set(existingMappings.map((m: any) => m.amazonFeeType));

    // Find fee types that are neither in the standard list nor already mapped
    const newFeeTypes: string[] = Array.from(reportFeeKeys).filter(
      (key) => !STANDARD_FEE_KEYS.has(key) && !existingKeys.has(key)
    );

    return NextResponse.json({
      success: true,
      reportId: saved.id,
      newFeeTypes,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Save settlement report error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save report" },
      { status: 500 }
    );
  }
}
