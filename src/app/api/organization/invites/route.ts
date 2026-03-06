import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrg, requireOwner } from "@/lib/session";
import { sendInviteEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const sendInviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["admin", "member"]).default("member"),
});

// GET /api/organization/invites — list pending invites
export async function GET() {
  try {
    const session = await requireOrg();

    const invites = await db.invite.findMany({
      where: {
        organizationId: session.user.organizationId,
        status: "pending",
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      invites: invites.map((i: any) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      })),
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    console.error("List invites error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

// POST /api/organization/invites — send an invite (owner only)
export async function POST(req: Request) {
  try {
    const session = await requireOwner();

    const body = await req.json();
    const parsed = sendInviteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, role } = parsed.data;

    // Check if user is already a member
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMember = await db.organizationMember.findFirst({
        where: {
          userId: existingUser.id,
          organizationId: session.user.organizationId,
        },
      });
      if (existingMember) {
        return NextResponse.json(
          { error: "This user is already a member of your organization" },
          { status: 409 }
        );
      }
    }

    // Check if there's already a pending invite
    const existingInvite = await db.invite.findFirst({
      where: {
        email,
        organizationId: session.user.organizationId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      return NextResponse.json(
        { error: "A pending invite already exists for this email" },
        { status: 409 }
      );
    }

    const org = await db.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { name: true },
    });

    const invite = await db.invite.create({
      data: {
        email,
        role,
        organizationId: session.user.organizationId,
        invitedBy: session.user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Send invite email (don't block on failure)
    try {
      await sendInviteEmail({
        to: email,
        orgName: org?.name || "your organization",
        token: invite.token,
        role,
      });
    } catch (emailErr) {
      console.error("Failed to send invite email:", emailErr);
    }

    return NextResponse.json(
      { invite: { id: invite.id, email: invite.email, role: invite.role } },
      { status: 201 }
    );
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Only the owner can send invites" }, { status: 403 });
    }
    console.error("Send invite error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

// DELETE /api/organization/invites?inviteId=xxx — revoke an invite (owner only)
export async function DELETE(req: Request) {
  try {
    const session = await requireOwner();

    const { searchParams } = new URL(req.url);
    const inviteId = searchParams.get("inviteId");

    if (!inviteId) {
      return NextResponse.json({ error: "inviteId is required" }, { status: 400 });
    }

    const invite = await db.invite.findUnique({ where: { id: inviteId } });

    if (!invite || invite.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    await db.invite.delete({ where: { id: inviteId } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "NO_ORGANIZATION") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Only the owner can revoke invites" }, { status: 403 });
    }
    console.error("Revoke invite error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
