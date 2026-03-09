"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface AmazonConnection {
  id: string;
  sellerId: string;
  marketplace: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const MARKETPLACE_LABELS: Record<string, string> = {
  ATVPDKIKX0DER: "United States",
  A2EUQ1WTGCTBG2: "Canada",
  A1AM78C64UM0Y8: "Mexico",
  A1PA6795UKMFR9: "Germany",
  A1RKKUPIHCS9HS: "Spain",
  A13V1IB3VIYBER: "France",
  A1F83G8C2ARO7P: "United Kingdom",
  APJ6JRA9NG5V4: "Italy",
};

export default function AmazonSettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading...</div>}>
      <AmazonSettingsContent />
    </Suspense>
  );
}

function AmazonSettingsContent() {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<AmazonConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualSellerId, setManualSellerId] = useState("");
  const [manualRefreshToken, setManualRefreshToken] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  // Show messages from OAuth callback redirects
  useEffect(() => {
    const successParam = searchParams.get("success");
    const errorParam = searchParams.get("error");

    if (successParam === "connected") {
      setSuccess("Amazon account connected successfully!");
    }
    if (errorParam) {
      const messages: Record<string, string> = {
        missing_params: "Authorization failed — missing parameters from Amazon.",
        invalid_state: "Authorization failed — invalid state parameter.",
        state_mismatch: "Authorization failed — organization mismatch.",
        not_configured: "Amazon SP-API credentials are not configured on the server.",
        token_exchange_failed: "Failed to exchange authorization code for tokens.",
        unexpected: "An unexpected error occurred during authorization.",
      };
      setError(messages[errorParam] || "Authorization failed.");
    }
  }, [searchParams]);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/amazon/connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections);
      }
    } catch {
      setError("Failed to load connections.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  async function handleDisconnect(connectionId: string, sellerId: string) {
    if (!confirm(`Disconnect Amazon seller ${sellerId}?`)) return;

    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/amazon/connections?id=${connectionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to disconnect.");
        return;
      }

      setSuccess("Connection removed.");
      fetchConnections();
    } catch {
      setError("Something went wrong.");
    }
  }

  // Listen for messages from the OAuth popup window
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "amazon-oauth-callback") {
        if (event.data.success) {
          setSuccess("Amazon account connected successfully!");
          setError("");
          fetchConnections();
        } else {
          const messages: Record<string, string> = {
            missing_params: "Authorization failed — missing parameters from Amazon.",
            invalid_state: "Authorization failed — invalid state parameter.",
            state_mismatch: "Authorization failed — organization mismatch.",
            not_configured: "Amazon SP-API credentials are not configured on the server.",
            token_exchange_failed: "Failed to exchange authorization code for tokens.",
            unexpected: "An unexpected error occurred during authorization.",
          };
          setError(messages[event.data.error] || "Authorization failed.");
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fetchConnections]);

  async function handleManualConnect() {
    if (!manualSellerId.trim() || !manualRefreshToken.trim()) {
      setError("Seller ID and Refresh Token are both required.");
      return;
    }

    setManualSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/amazon/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId: manualSellerId.trim(),
          refreshToken: manualRefreshToken.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to connect.");
        return;
      }

      setSuccess("Amazon account connected successfully!");
      setManualSellerId("");
      setManualRefreshToken("");
      setShowManual(false);
      fetchConnections();
    } catch {
      setError("Something went wrong.");
    } finally {
      setManualSubmitting(false);
    }
  }

  function handleConnect() {
    // Open Amazon auth in a popup window
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(
      "/api/amazon/authorize",
      "amazon-oauth",
      `width=${width},height=${height},left=${left},top=${top},popup=yes`
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Amazon SP-API Connection
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Connect your Amazon Seller Central account to sync orders, fees, and
          settlement reports.
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

      {/* Connect Button */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Connect a New Account
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          A new window will open to Amazon Seller Central to authorize access.
          Your tokens are stored encrypted with AES-256.
        </p>
        <button
          onClick={handleConnect}
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Connect Amazon Account
        </button>
      </div>

      {/* Manual Token Entry (for draft/sandbox apps) */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white">
        <button
          onClick={() => setShowManual(!showManual)}
          className="flex w-full items-center justify-between px-6 py-4 text-left"
        >
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Manual Connection (Sandbox / Draft App)
            </h2>
            <p className="text-sm text-gray-500">
              Paste a refresh token from Developer Central self-authorization
            </p>
          </div>
          <span className="text-gray-400 text-sm">
            {showManual ? "Hide" : "Show"}
          </span>
        </button>

        {showManual && (
          <div className="border-t border-gray-200 px-6 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seller ID
              </label>
              <input
                type="text"
                value={manualSellerId}
                onChange={(e) => setManualSellerId(e.target.value)}
                placeholder="e.g. A1B2C3D4E5F6G7"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Refresh Token
              </label>
              <textarea
                value={manualRefreshToken}
                onChange={(e) => setManualRefreshToken(e.target.value)}
                placeholder="Atzr|..."
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono"
              />
              <p className="mt-1 text-xs text-gray-500">
                Get this from Seller Central &gt; Developer Central &gt; your
                app &gt; Authorize (self-authorization).
              </p>
            </div>
            <button
              onClick={handleManualConnect}
              disabled={manualSubmitting}
              className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
            >
              {manualSubmitting ? "Connecting..." : "Save Connection"}
            </button>
          </div>
        )}
      </div>

      {/* Existing Connections */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Connected Accounts ({connections.length})
          </h2>
        </div>

        {isLoading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            Loading...
          </div>
        ) : connections.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            No Amazon accounts connected yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {connections.map((conn) => (
              <li
                key={conn.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Seller ID: {conn.sellerId}
                  </p>
                  <p className="text-xs text-gray-500">
                    Marketplace:{" "}
                    {MARKETPLACE_LABELS[conn.marketplace] || conn.marketplace}
                  </p>
                  <p className="text-xs text-gray-500">
                    Connected{" "}
                    {new Date(conn.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      conn.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {conn.isActive ? "Active" : "Inactive"}
                  </span>
                  <button
                    onClick={() => handleDisconnect(conn.id, conn.sellerId)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Disconnect
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
