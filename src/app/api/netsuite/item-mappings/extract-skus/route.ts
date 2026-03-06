import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { parseSettlementReport } from "@/lib/amazon-sp-api";

export const dynamic = "force-dynamic";

/**
 * POST /api/netsuite/item-mappings/extract-skus
 * Upload a settlement report flat file and extract unique SKUs.
 * Returns { skus: Array<{ sku: string; orderCount: number }> }
 */
export async function POST(req: Request) {
  try {
    await requireOrg();

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "A settlement report file is required" },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File is too large (max 10 MB)" },
        { status: 400 }
      );
    }

    const text = await file.text();
    if (!text.trim()) {
      return NextResponse.json(
        { error: "File is empty" },
        { status: 400 }
      );
    }

    const report = parseSettlementReport(text);

    // Aggregate unique SKUs with order counts
    const skuMap = new Map<string, number>();
    for (const tx of report.transactions) {
      if (tx.sku && tx.sku.trim()) {
        const sku = tx.sku.trim();
        skuMap.set(sku, (skuMap.get(sku) || 0) + 1);
      }
    }

    const skus = Array.from(skuMap.entries())
      .map(([sku, orderCount]) => ({ sku, orderCount }))
      .sort((a, b) => a.sku.localeCompare(b.sku));

    return NextResponse.json({ skus, settlementId: report.settlementId });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Extract SKUs error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to parse report file" },
      { status: 500 }
    );
  }
}
