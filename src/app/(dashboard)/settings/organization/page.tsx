"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Member {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  joinedAt: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

export default function OrganizationSettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isOwner = session?.user?.role === "owner";

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const [membersRes, invitesRes] = await Promise.all([
      fetch("/api/organization/members"),
      fetch("/api/organization/invites"),
    ]);

    if (membersRes.ok) {
      const data = await membersRes.json();
      setMembers(data.members);
    }
    if (invitesRes.ok) {
      const data = await invitesRes.json();
      setInvites(data.invites);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!inviteEmail.trim()) {
      setError("Please enter an email address");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/organization/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        setIsLoading(false);
        return;
      }

      setSuccess(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteRole("member");
      fetchData();
    } catch {
      setError("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRemoveMember(memberId: string, memberName: string | null) {
    if (!confirm(`Remove ${memberName || "this member"} from the organization?`)) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/organization/members?memberId=${memberId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      setSuccess("Member removed");
      fetchData();
    } catch {
      setError("Something went wrong");
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/organization/invites?inviteId=${inviteId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      setSuccess("Invite revoked");
      fetchData();
    } catch {
      setError("Something went wrong");
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Organization Settings</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your team members and invitations.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-600">
          {success}
        </div>
      )}

      {/* Invite Form — Owner only */}
      {isOwner && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Invite Team Member
          </h2>
          <form onSubmit={handleInvite} className="flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setError("");
              }}
              placeholder="colleague@example.com"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? "Sending..." : "Send Invite"}
            </button>
          </form>
        </div>
      )}

      {/* Members List */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Members ({members.length})
          </h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {member.name || member.email}
                  {member.userId === session?.user?.id && (
                    <span className="ml-2 text-xs text-gray-400">(you)</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">{member.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    member.role === "owner"
                      ? "bg-purple-100 text-purple-700"
                      : member.role === "admin"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {member.role}
                </span>
                {isOwner && member.userId !== session?.user?.id && (
                  <button
                    onClick={() => handleRemoveMember(member.id, member.name)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
          {members.length === 0 && (
            <li className="px-6 py-8 text-center text-sm text-gray-500">
              No members found.
            </li>
          )}
        </ul>
      </div>

      {/* Pending Invites */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Pending Invites ({invites.length})
          </h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {invites.map((invite) => (
            <li key={invite.id} className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{invite.email}</p>
                <p className="text-xs text-gray-500">
                  Expires {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                  {invite.role}
                </span>
                {isOwner && (
                  <button
                    onClick={() => handleRevokeInvite(invite.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </li>
          ))}
          {invites.length === 0 && (
            <li className="px-6 py-8 text-center text-sm text-gray-500">
              No pending invites.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
