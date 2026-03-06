import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/amazon/connections — list connections for this org
export async function GET() {
  try {
    const session = await requireOrg();

    const connections = await db.amazonConnection.findMany({
      where: { organizationId: session.user.organizationId },
      select: {
        id: true,
        sellerId: true,
        marketplace: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ connections });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("List Amazon connections error:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

// DELETE /api/amazon/connections?id=xxx — disconnect
export async function DELETE(req: Request) {
  try {
    const session = await requireOrg();

    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get("id");

    if (!connectionId) {
      return NextResponse.json(
        { error: "Connection ID is required" },
        { status: 400 }
      );
    }

    const connection = await db.amazonConnection.findUnique({
      where: { id: connectionId },
    });

    if (
      !connection ||
      connection.organizationId !== session.user.organizationId
    ) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    await db.amazonConnection.delete({ where: { id: connectionId } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("Delete Amazon connection error:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
