import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { parseShipmentReport } from "@/lib/amazon-shipments-parser";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireOrg();

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "A shipment report file is required" },
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
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const report = parseShipmentReport(text);

    return NextResponse.json({ report });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Upload shipment report error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to parse shipment report file" },
      { status: 500 }
    );
  }
}
