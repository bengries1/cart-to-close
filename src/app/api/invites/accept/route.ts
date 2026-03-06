import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/invites/accept?token=xxx — accept invite via email link
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid_invite", req.url));
  }

  // Look up the invite by token
  const invite = await db.invite.findUnique({
    where: { token },
    include: { organization: { select: { name: true } } },
  });

  if (!invite) {
    return NextResponse.redirect(new URL("/login?error=invite_not_found", req.url));
  }

  if (invite.status !== "pending") {
    return NextResponse.redirect(new URL("/login?error=invite_already_used", req.url));
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.redirect(new URL("/login?error=invite_expired", req.url));
  }

  // Check if user is logged in
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session?.user?.email) {
    // Not logged in — redirect to login with a return URL
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", `/api/invites/accept?token=${token}`);
    return NextResponse.redirect(loginUrl);
  }

  // Verify the invite email matches the logged-in user
  if (invite.email !== session.user.email) {
    return NextResponse.redirect(
      new URL("/dashboard?error=invite_email_mismatch", req.url)
    );
  }

  // Check if already a member of this org
  const existingMember = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organizationId: invite.organizationId,
    },
  });

  if (existingMember) {
    // Already a member — mark invite as accepted and redirect
    await db.invite.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    });
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Accept: create membership and mark invite as accepted
  await db.$transaction(async (tx: any) => {
    await tx.organizationMember.create({
      data: {
        userId: session.user.id,
        organizationId: invite.organizationId,
        role: invite.role,
      },
    });

    await tx.invite.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    });
  });

  // Redirect to dashboard (session will pick up the new org on next JWT refresh)
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
