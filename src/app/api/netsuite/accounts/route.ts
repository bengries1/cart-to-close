import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";
import { NetSuiteClient } from "@/lib/netsuite-client";

export const dynamic = "force-dynamic";

const CACHE_KEY = "accounts";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedAccount {
  id: string;
  name: string;
  number: string;
  type: string;
}

/**
 * GET /api/netsuite/accounts
 * Returns all GL accounts (id, name, number, type).
 * Serves from DB cache if fresh; pass ?refresh=true to force re-fetch.
 */
export async function GET(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;

    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await db.netSuiteCache.findUnique({
        where: { organizationId_cacheKey: { organizationId: orgId, cacheKey: CACHE_KEY } },
      });

      if (cached) {
        const age = Date.now() - cached.fetchedAt.getTime();
        if (age < CACHE_MAX_AGE_MS) {
          return NextResponse.json({
            accounts: cached.data as unknown as CachedAccount[],
            cachedAt: cached.fetchedAt.toISOString(),
            fromCache: true,
          });
        }
      }
    }

    // Fetch fresh data from NetSuite
    const client = await NetSuiteClient.forOrganization(orgId);
    const rawAccounts = await client.getAccounts();

    const accounts: CachedAccount[] = rawAccounts.map((a) => ({
      id: a.id,
      name: a.acctName,
      number: a.acctNumber,
      type: a.acctType,
    }));

    // Upsert cache
    const now = new Date();
    await db.netSuiteCache.upsert({
      where: { organizationId_cacheKey: { organizationId: orgId, cacheKey: CACHE_KEY } },
      update: {
        data: accounts as any,
        recordCount: accounts.length,
        fetchedAt: now,
      },
      create: {
        organizationId: orgId,
        cacheKey: CACHE_KEY,
        data: accounts as any,
        recordCount: accounts.length,
        fetchedAt: now,
      },
    });

    return NextResponse.json({
      accounts,
      cachedAt: now.toISOString(),
      fromCache: false,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (err.message?.includes("No active NetSuite")) {
      return NextResponse.json(
        { error: "No NetSuite connection. Connect in Settings first." },
        { status: 404 }
      );
    }
    console.error("Fetch NetSuite accounts error:", err);
    return NextResponse.json(
      { error: "Failed to fetch accounts from NetSuite" },
      { status: 500 }
    );
  }
}
