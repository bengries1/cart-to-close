import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireOrg } from "@/lib/session";

// GET /api/amazon/authorize — redirect to Amazon LWA consent page
export async function GET() {
  try {
    const session = await requireOrg();

    const clientId = process.env.AMAZON_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: "Amazon SP-API is not configured" },
        { status: 500 }
      );
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const redirectUri = `${baseUrl}/api/amazon/callback`;

    // State includes org ID + random nonce to prevent CSRF
    const nonce = crypto.randomBytes(16).toString("hex");
    const state = Buffer.from(
      JSON.stringify({ orgId: session.user.organizationId, nonce })
    ).toString("base64url");

    const params = new URLSearchParams({
      application_id: clientId,
      state,
      redirect_uri: redirectUri,
    });

    const amazonUrl = `https://sellercentral.amazon.com/apps/authorize/consent?${params.toString()}`;

    return NextResponse.redirect(amazonUrl);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Amazon authorize error:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
