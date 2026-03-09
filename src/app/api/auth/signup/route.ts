import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signupSchema } from "@/lib/validations/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password } = parsed.data;
    const inviteToken = body.inviteToken as string | undefined;

    // Require a valid invite
    if (!inviteToken) {
      return NextResponse.json(
        { error: "Registration is invite-only. Please use an invite link." },
        { status: 403 }
      );
    }

    const invite = await db.invite.findUnique({
      where: { token: inviteToken },
    });

    if (!invite) {
      return NextResponse.json(
        { error: "Invalid invite link." },
        { status: 403 }
      );
    }

    if (invite.status !== "pending") {
      return NextResponse.json(
        { error: "This invite has already been used." },
        { status: 403 }
      );
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This invite has expired. Please request a new one." },
        { status: 403 }
      );
    }

    if (invite.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { error: "Please sign up with the email address the invite was sent to." },
        { status: 403 }
      );
    }

    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user and add to the invite's organization in one transaction
    const user = await db.$transaction(async (tx: any) => {
      const newUser = await tx.user.create({
        data: { name, email, hashedPassword },
      });

      // Add user as member of the inviting organization
      await tx.organizationMember.create({
        data: {
          userId: newUser.id,
          organizationId: invite.organizationId,
          role: invite.role,
        },
      });

      // Mark invite as accepted
      await tx.invite.update({
        where: { id: invite.id },
        data: { status: "accepted" },
      });

      return newUser;
    });

    return NextResponse.json(
      { user: { id: user.id, name: user.name, email: user.email } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
