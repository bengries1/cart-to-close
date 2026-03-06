import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrg, requireOwner } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/organization/members — list all members
export async function GET() {
  try {
    const session = await requireOrg();

    const members = await db.organizationMember.findMany({
      where: { organizationId: session.user.organizationId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      members: members.map((m: any) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt,
      })),
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("List members error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

// DELETE /api/organization/members?memberId=xxx — remove a member (owner only)
export async function DELETE(req: Request) {
  try {
    const session = await requireOwner();

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");

    if (!memberId) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    const member = await db.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Prevent owner from removing themselves
    if (member.userId === session.user.id) {
      return NextResponse.json(
        { error: "You cannot remove yourself from the organization" },
        { status: 400 }
      );
    }

    await db.organizationMember.delete({ where: { id: memberId } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Only the owner can remove members" }, { status: 403 });
    }
    console.error("Remove member error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
