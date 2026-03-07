"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { createOrgSchema, type CreateOrgInput } from "@/lib/validations/auth";

interface Invite {
  id: string;
  role: string;
  organization: {
    id: string;
    name: string;
  };
}

export default function OnboardingPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "invites">("create");
  const [orgName, setOrgName] = useState("");
  const [orgError, setOrgError] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [invitesLoading, setInvitesLoading] = useState(true);

  // If user already has an org, redirect to dashboard
  useEffect(() => {
    if (session?.user?.organizationId) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/invites");
      const data = await res.json();
      if (res.ok) {
        setInvites(data.invites);
        if (data.invites.length > 0) {
          setTab("invites");
        }
      }
    } catch {
      // Silently fail — invites are optional
    } finally {
      setInvitesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setOrgError("");

    const parsed = createOrgSchema.safeParse({ name: orgName });
    if (!parsed.success) {
      setOrgError(parsed.error.issues[0].message);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/onboarding/create-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setOrgError(data.error || "Something went wrong");
        setIsLoading(false);
        return;
      }

      // Refresh the session so organizationId is populated
      await update();
      router.push("/dashboard");
      router.refresh();
    } catch {
      setIsLoading(false);
      setOrgError("Something went wrong. Please try again.");
    }
  }

  async function handleAcceptInvite(inviteId: string) {
    setIsLoading(true);

    try {
      const res = await fetch("/api/onboarding/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setOrgError(data.error || "Something went wrong");
        setIsLoading(false);
        return;
      }

      await update();
      router.push("/dashboard");
      router.refresh();
    } catch {
      setIsLoading(false);
      setOrgError("Something went wrong. Please try again.");
    }
  }

  if (invitesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="rounded-lg bg-white p-8 shadow">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Set Up Your Organization
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Create a new organization or join an existing one.
            </p>
          </div>

          {/* Tabs */}
          <div className="mb-6 flex border-b border-gray-200">
            <button
              onClick={() => setTab("create")}
              className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                tab === "create"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Create New
            </button>
            <button
              onClick={() => setTab("invites")}
              className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                tab === "invites"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Pending Invites
              {invites.length > 0 && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {invites.length}
                </span>
              )}
            </button>
          </div>

          {orgError && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
              {orgError}
            </div>
          )}

          {tab === "create" && (
            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label
                  htmlFor="orgName"
                  className="block text-sm font-medium text-gray-700"
                >
                  Organization Name
                </label>
                <input
                  id="orgName"
                  type="text"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    setOrgError("");
                  }}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Acme Inc."
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? "Creating..." : "Create Organization"}
              </button>
            </form>
          )}

          {tab === "invites" && (
            <div>
              {invites.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-4">
                  No pending invites. Ask your team admin to send you an
                  invitation.
                </p>
              ) : (
                <ul className="space-y-3">
                  {invites.map((invite) => (
                    <li
                      key={invite.id}
                      className="flex items-center justify-between rounded-md border border-gray-200 p-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {invite.organization.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          Role: {invite.role}
                        </p>
                      </div>
                      <button
                        onClick={() => handleAcceptInvite(invite.id)}
                        disabled={isLoading}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Accept
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-6 border-t border-gray-200 pt-4">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
