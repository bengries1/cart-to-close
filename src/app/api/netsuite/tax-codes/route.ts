import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";
import { NetSuiteClient } from "@/lib/netsuite-client";

export const dynamic = "force-dynamic";

const CACHE_KEY = "taxCodes";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface CachedTaxCode {
  id: string;
  name: string;
  rate: string | null;
}

export async function GET(req: Request) {
  try {
    const session = await requireOrg();
    const orgId = session.user.organizationId;

    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    if (!forceRefresh) {
      const cached = await db.netSuiteCache.findUnique({
        where: { organizationId_cacheKey: { organizationId: orgId, cacheKey: CACHE_KEY } },
      });

      if (cached) {
        const age = Date.now() - cached.fetchedAt.getTime();
        if (age < CACHE_MAX_AGE_MS) {
          return NextResponse.json({
            taxCodes: cached.data as unknown as CachedTaxCode[],
            cachedAt: cached.fetchedAt.toISOString(),
            fromCache: true,
          });
        }
      }
    }

    const client = await NetSuiteClient.forOrganization(orgId);
    const raw = await client.getTaxCodes();

    const taxCodes: CachedTaxCode[] = raw.map((t) => ({
      id: t.id,
      name: t.name,
      rate: t.rate || null,
    }));

    const now = new Date();
    await db.netSuiteCache.upsert({
      where: { organizationId_cacheKey: { organizationId: orgId, cacheKey: CACHE_KEY } },
      update: { data: taxCodes as any, recordCount: taxCodes.length, fetchedAt: now },
      create: { organizationId: orgId, cacheKey: CACHE_KEY, data: taxCodes as any, recordCount: taxCodes.length, fetchedAt: now },
    });

    return NextResponse.json({ taxCodes, cachedAt: now.toISOString(), fromCache: false });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err.message === "NO_ORGANIZATION") return NextResponse.json({ error: "No organization" }, { status: 403 });
    if (err.message?.includes("No active NetSuite")) return NextResponse.json({ error: "No NetSuite connection." }, { status: 404 });
    console.error("Fetch NetSuite tax codes error:", err);
    return NextResponse.json({ error: "Failed to fetch tax codes" }, { status: 500 });
  }
}
