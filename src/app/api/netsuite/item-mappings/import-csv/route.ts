import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * POST /api/netsuite/item-mappings/import-csv
 * Upload a CSV with columns: amazon_sku, netsuite_item_id
 * Optional columns: amazon_title, netsuite_item_name
 * Upserts all rows into ItemMapping.
 */
export async function POST(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "A CSV file is required" },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File is too large (max 5 MB)" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());

    if (lines.length < 2) {
      return NextResponse.json(
        { error: "CSV must have a header row and at least one data row" },
        { status: 400 }
      );
    }

    // Parse header
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
    const skuCol = header.indexOf("amazon_sku");
    const nsItemCol = header.indexOf("netsuite_item_id");

    if (skuCol === -1) {
      return NextResponse.json(
        { error: "CSV must have an 'amazon_sku' column" },
        { status: 400 }
      );
    }
    if (nsItemCol === -1) {
      return NextResponse.json(
        { error: "CSV must have a 'netsuite_item_id' column" },
        { status: 400 }
      );
    }

    const titleCol = header.indexOf("amazon_title");
    const nsNameCol = header.indexOf("netsuite_item_name");

    // Parse data rows
    const mappings: Array<{
      amazonSku: string;
      netSuiteItemId: string;
      amazonTitle: string | null;
      netSuiteItemName: string | null;
    }> = [];

    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const sku = cols[skuCol]?.trim();
      const nsId = cols[nsItemCol]?.trim();

      if (!sku) {
        errors.push(`Row ${i + 1}: missing amazon_sku`);
        continue;
      }
      if (!nsId) {
        errors.push(`Row ${i + 1}: missing netsuite_item_id for SKU "${sku}"`);
        continue;
      }

      mappings.push({
        amazonSku: sku,
        netSuiteItemId: nsId,
        amazonTitle: titleCol !== -1 ? cols[titleCol]?.trim() || null : null,
        netSuiteItemName: nsNameCol !== -1 ? cols[nsNameCol]?.trim() || null : null,
      });
    }

    if (mappings.length === 0) {
      return NextResponse.json(
        { error: "No valid mappings found in CSV", details: errors },
        { status: 400 }
      );
    }

    // Upsert all
    await db.$transaction(
      mappings.map((m) =>
        db.itemMapping.upsert({
          where: {
            organizationId_amazonSku: {
              organizationId: orgId,
              amazonSku: m.amazonSku,
            },
          },
          update: {
            netSuiteItemId: m.netSuiteItemId,
            amazonTitle: m.amazonTitle,
            netSuiteItemName: m.netSuiteItemName,
          },
          create: {
            organizationId: orgId,
            amazonSku: m.amazonSku,
            netSuiteItemId: m.netSuiteItemId,
            amazonTitle: m.amazonTitle,
            netSuiteItemName: m.netSuiteItemName,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      imported: mappings.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Import CSV item mappings error:", err);
    return NextResponse.json(
      { error: "Failed to import CSV" },
      { status: 500 }
    );
  }
}

/** Simple CSV line parser that handles quoted fields with commas. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
