import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireOrg() {
  const session = await requireSession();
  if (!session.user.organizationId) {
    throw new Error("NO_ORGANIZATION");
  }
  return session as typeof session & {
    user: { organizationId: string; role: string };
  };
}

export async function requireOwner() {
  const session = await requireOrg();
  if (session.user.role !== "owner") {
    throw new Error("FORBIDDEN");
  }
  return session;
}
