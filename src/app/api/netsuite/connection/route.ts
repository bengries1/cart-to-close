import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";
import {
  testNetSuiteConnection,
  saveNetSuiteConnection,
  type NetSuiteCredentials,
} from "@/lib/netsuite";

// POST /api/netsuite/connection — test & save NetSuite credentials
export async function POST(req: Request) {
  try {
    const session = await requireOrg();

    const body = await req.json();
    const { accountId, consumerKey, consumerSecret, tokenId, tokenSecret } =
      body;

    if (!accountId || !consumerKey || !consumerSecret || !tokenId || !tokenSecret) {
      return NextResponse.json(
        { error: "All five credential fields are required" },
        { status: 400 }
      );
    }

    const creds: NetSuiteCredentials = {
      accountId: accountId.trim(),
      consumerKey: consumerKey.trim(),
      consumerSecret: consumerSecret.trim(),
      tokenId: tokenId.trim(),
      tokenSecret: tokenSecret.trim(),
    };

    // Validate by making a test API call
    let testResult;
    try {
      testResult = await testNetSuiteConnection(creds);
    } catch (err: any) {
      return NextResponse.json(
        {
          error: "Connection test failed",
          details: err.message || "Could not connect to NetSuite",
        },
        { status: 422 }
      );
    }

    // Save encrypted credentials
    await saveNetSuiteConnection(session.user.organizationId, creds);

    return NextResponse.json({
      success: true,
      accountId: creds.accountId,
      subsidiaries: testResult.subsidiaries,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Save NetSuite connection error:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

// GET /api/netsuite/connection — get connection status
export async function GET() {
  try {
    const session = await requireOrg();

    const conn = await db.netSuiteConnection.findFirst({
      where: {
        organizationId: session.user.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        accountId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (!conn) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      accountId: conn.accountId,
      connectedAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Get NetSuite connection error:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

// DELETE /api/netsuite/connection — disconnect
export async function DELETE() {
  try {
    const session = await requireOrg();

    await db.netSuiteConnection.updateMany({
      where: {
        organizationId: session.user.organizationId,
        isActive: true,
      },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Delete NetSuite connection error:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
