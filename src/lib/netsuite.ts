import crypto from "crypto";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

export interface NetSuiteCredentials {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
}

// ──────────────────────────────────────────
// OAuth 1.0a Signature (HMAC-SHA256)
// ──────────────────────────────────────────

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

function buildOAuthHeader(
  method: string,
  url: string,
  creds: NetSuiteCredentials
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_token: creds.tokenId,
    oauth_nonce: nonce,
    oauth_timestamp: timestamp,
    oauth_signature_method: "HMAC-SHA256",
    oauth_version: "1.0",
  };

  // Parse any query params from the URL
  const urlObj = new URL(url);
  const allParams: Record<string, string> = { ...oauthParams };
  urlObj.searchParams.forEach((value, key) => {
    allParams[key] = value;
  });

  // Build base string: sorted params
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const baseUrl = `${urlObj.origin}${urlObj.pathname}`;
  const baseString = `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(paramString)}`;

  // Sign with consumer secret & token secret
  const signingKey = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.tokenSecret)}`;
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(baseString)
    .digest("base64");

  oauthParams["oauth_signature"] = signature;

  // Build header string
  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth realm="${creds.accountId}", ${headerParts}`;
}

// ──────────────────────────────────────────
// NetSuite REST API Client
// ──────────────────────────────────────────

function getBaseUrl(accountId: string): string {
  // NetSuite account IDs use underscores for sandbox, e.g. "1234567_SB1"
  const normalized = accountId.toLowerCase().replace(/_/g, "-");
  return `https://${normalized}.suitetalk.api.netsuite.com`;
}

/**
 * Make a request to the NetSuite REST API using OAuth 1.0a TBA.
 */
export async function netsuiteRequest<T>(
  creds: NetSuiteCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const baseUrl = getBaseUrl(creds.accountId);
  const url = `${baseUrl}${path}`;

  const authHeader = buildOAuthHeader(method, url, creds);

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `NetSuite ${method} ${path} failed (${res.status}): ${text}`
    );
  }

  // Some endpoints return empty body on success
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text);
}

/**
 * Test a NetSuite connection by fetching subsidiaries.
 * Returns the list of subsidiaries on success, throws on failure.
 */
export async function testNetSuiteConnection(
  creds: NetSuiteCredentials
): Promise<{ success: true; subsidiaries: Array<{ id: string; name: string }> }> {
  const data = await netsuiteRequest<any>(
    creds,
    "GET",
    "/services/rest/record/v1/subsidiary"
  );

  const items = data.items || [];
  return {
    success: true,
    subsidiaries: items.map((item: any) => ({
      id: item.id,
      name: item.companyName || item.name || `Subsidiary ${item.id}`,
    })),
  };
}

/**
 * Load decrypted NetSuite credentials from the database for an org.
 */
export async function getNetSuiteCredentials(
  organizationId: string
): Promise<NetSuiteCredentials | null> {
  const conn = await db.netSuiteConnection.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!conn) return null;

  return {
    accountId: conn.accountId,
    consumerKey: decrypt(conn.consumerKey),
    consumerSecret: decrypt(conn.consumerSecret),
    tokenId: decrypt(conn.tokenId),
    tokenSecret: decrypt(conn.tokenSecret),
  };
}

/**
 * Save (upsert) encrypted NetSuite credentials for an org.
 */
export async function saveNetSuiteConnection(
  organizationId: string,
  creds: NetSuiteCredentials
): Promise<void> {
  await db.netSuiteConnection.upsert({
    where: {
      organizationId_accountId: {
        organizationId,
        accountId: creds.accountId,
      },
    },
    update: {
      consumerKey: encrypt(creds.consumerKey),
      consumerSecret: encrypt(creds.consumerSecret),
      tokenId: encrypt(creds.tokenId),
      tokenSecret: encrypt(creds.tokenSecret),
      isActive: true,
    },
    create: {
      organizationId,
      accountId: creds.accountId,
      consumerKey: encrypt(creds.consumerKey),
      consumerSecret: encrypt(creds.consumerSecret),
      tokenId: encrypt(creds.tokenId),
      tokenSecret: encrypt(creds.tokenSecret),
    },
  });
}
