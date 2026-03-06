import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createOrgSchema } from "@/lib/validations/auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createOrgSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Check if user already has an org
    const existing = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    });

    if (existing) {
      return NextResponse.json(
        { error: "You already belong to an organization" },
        { status: 409 }
      );
    }

    const result = await db.$transaction(async (tx: any) => {
      const org = await tx.organization.create({
        data: { name: parsed.data.name },
      });

      await tx.organizationMember.create({
        data: {
          userId: session.user.id,
          organizationId: org.id,
          role: "owner",
        },
      });

      return org;
    });

    return NextResponse.json(
      { organization: { id: result.id, name: result.name } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create org error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
