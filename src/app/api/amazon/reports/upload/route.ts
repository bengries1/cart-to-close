import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { parseSettlementReport } from "@/lib/amazon-sp-api";

export const dynamic = "force-dynamic";

// POST /api/amazon/reports/upload — parse an uploaded settlement flat file
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

    // Validate file size (10 MB max)
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

    return NextResponse.json({ report });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Upload settlement report error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to parse report file" },
      { status: 500 }
    );
  }
}
