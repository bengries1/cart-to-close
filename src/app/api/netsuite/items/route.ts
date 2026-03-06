import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";
import { NetSuiteClient } from "@/lib/netsuite-client";

export const dynamic = "force-dynamic";

const CACHE_KEY = "items";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedItem {
  id: string;
  name: string;
  sku: string;
  type: string;
  displayName: string | null;
}

/**
 * GET /api/netsuite/items
 * Returns all active items (id, name, sku, type, displayName).
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
            items: cached.data as unknown as CachedItem[],
            cachedAt: cached.fetchedAt.toISOString(),
            fromCache: true,
          });
        }
      }
    }

    // Fetch fresh data from NetSuite
    const client = await NetSuiteClient.forOrganization(orgId);
    const rawItems = await client.getItems();

    const items: CachedItem[] = rawItems.map((i) => ({
      id: i.id,
      name: i.itemId,
      sku: i.itemId,
      type: i.itemType,
      displayName: i.displayName || null,
    }));

    // Upsert cache
    const now = new Date();
    await db.netSuiteCache.upsert({
      where: { organizationId_cacheKey: { organizationId: orgId, cacheKey: CACHE_KEY } },
      update: {
        data: items as any,
        recordCount: items.length,
        fetchedAt: now,
      },
      create: {
        organizationId: orgId,
        cacheKey: CACHE_KEY,
        data: items as any,
        recordCount: items.length,
        fetchedAt: now,
      },
    });

    return NextResponse.json({
      items,
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
    console.error("Fetch NetSuite items error:", err);
    return NextResponse.json(
      { error: "Failed to fetch items from NetSuite" },
      { status: 500 }
    );
  }
}
