import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

/** Return an HTML page that posts a message to the opener window and closes itself */
function popupResponse(payload: { success: boolean; error?: string }) {
  const html = `<!DOCTYPE html>
<html><head><title>Amazon Authorization</title></head>
<body>
<p>Authorization complete. This window will close automatically.</p>
<script>
  if (window.opener) {
    window.opener.postMessage(
      { type: "amazon-oauth-callback", success: ${payload.success}${payload.error ? `, error: "${payload.error}"` : ""} },
      window.location.origin
    );
  }
  window.close();
</script>
</body></html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}

// GET /api/amazon/callback — Amazon redirects here after consent
export async function GET(req: Request) {
  try {
    const session = await requireOrg();
    const { searchParams } = new URL(req.url);

    const spApiOauthCode = searchParams.get("spapi_oauth_code");
    const state = searchParams.get("state");
    const sellingPartnerId = searchParams.get("selling_partner_id");

    if (!spApiOauthCode || !state || !sellingPartnerId) {
      return popupResponse({ success: false, error: "missing_params" });
    }

    // Verify state contains this org's ID
    let stateData: { orgId: string; nonce: string };
    try {
      stateData = JSON.parse(
        Buffer.from(state, "base64url").toString("utf8")
      );
    } catch {
      return popupResponse({ success: false, error: "invalid_state" });
    }

    if (stateData.orgId !== session.user.organizationId) {
      return popupResponse({ success: false, error: "state_mismatch" });
    }

    // Exchange the authorization code for refresh + access tokens
    const clientId = process.env.AMAZON_CLIENT_ID;
    const clientSecret = process.env.AMAZON_CLIENT_SECRET;
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    if (!clientId || !clientSecret) {
      return popupResponse({ success: false, error: "not_configured" });
    }

    const tokenRes = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: spApiOauthCode,
        redirect_uri: `${baseUrl}/api/amazon/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      console.error(
        "Amazon token exchange failed:",
        tokenRes.status,
        await tokenRes.text()
      );
      return popupResponse({ success: false, error: "token_exchange_failed" });
    }

    const tokenData = await tokenRes.json();
    const { refresh_token, access_token, expires_in } = tokenData;

    // Encrypt tokens before storing
    const encryptedRefreshToken = encrypt(refresh_token);
    const encryptedAccessToken = access_token
      ? encrypt(access_token)
      : null;

    const tokenExpiry = expires_in
      ? new Date(Date.now() + expires_in * 1000)
      : null;

    // Upsert the connection (one per org + seller)
    await db.amazonConnection.upsert({
      where: {
        organizationId_sellerId: {
          organizationId: session.user.organizationId,
          sellerId: sellingPartnerId,
        },
      },
      update: {
        refreshToken: encryptedRefreshToken,
        accessToken: encryptedAccessToken,
        tokenExpiry,
        isActive: true,
      },
      create: {
        organizationId: session.user.organizationId,
        sellerId: sellingPartnerId,
        refreshToken: encryptedRefreshToken,
        accessToken: encryptedAccessToken,
        tokenExpiry,
        isActive: true,
      },
    });

    return popupResponse({ success: true });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED" || err.message === "NO_ORGANIZATION") {
      return popupResponse({ success: false, error: "unexpected" });
    }
    console.error("Amazon callback error:", err);
    return popupResponse({ success: false, error: "unexpected" });
  }
}
