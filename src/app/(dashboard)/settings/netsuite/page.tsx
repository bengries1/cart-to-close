"use client";

import { useState, useEffect } from "react";

interface ConnectionStatus {
  connected: boolean;
  accountId?: string;
  connectedAt?: string;
  updatedAt?: string;
}

export default function NetSuiteSettingsPage() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const [success, setSuccess] = useState("");

  const [accountId, setAccountId] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [tokenSecret, setTokenSecret] = useState("");

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    setIsLoadingStatus(true);
    try {
      const res = await fetch("/api/netsuite/connection");
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
      }
    } catch {
      // ignore — will show form
    } finally {
      setIsLoadingStatus(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setErrorDetails("");
    setSuccess("");
    setIsSaving(true);

    try {
      const res = await fetch("/api/netsuite/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          consumerKey,
          consumerSecret,
          tokenId,
          tokenSecret,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to connect");
        if (data.details) setErrorDetails(data.details);
        return;
      }

      setSuccess(
        `Connected to NetSuite account ${data.accountId}` +
          (data.subsidiaries?.length
            ? ` (${data.subsidiaries.length} ${data.subsidiaries.length === 1 ? "subsidiary" : "subsidiaries"} found)`
            : "")
      );

      // Clear form & refresh status
      setAccountId("");
      setConsumerKey("");
      setConsumerSecret("");
      setTokenId("");
      setTokenSecret("");
      await fetchStatus();
    } catch {
      setError("Something went wrong");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Are you sure you want to disconnect NetSuite?")) return;

    setError("");
    setSuccess("");
    setIsDisconnecting(true);

    try {
      const res = await fetch("/api/netsuite/connection", { method: "DELETE" });
      if (res.ok) {
        setStatus({ connected: false });
        setSuccess("NetSuite disconnected");
      } else {
        setError("Failed to disconnect");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setIsDisconnecting(false);
    }
  }

  function formatDate(iso?: string) {
    if (!iso) return "\u2014";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (isLoadingStatus) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          NetSuite Connection
        </h1>
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          NetSuite Connection
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Connect your NetSuite account using Token-Based Authentication (TBA).
          All credentials are encrypted at rest.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          <p className="font-medium">{error}</p>
          {errorDetails && (
            <p className="mt-1 text-xs text-red-500">{errorDetails}</p>
          )}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-600">
          {success}
        </div>
      )}

      {/* Current Connection Status */}
      {status?.connected && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-800">
                  Connected
                </span>
              </div>
              <p className="mt-1 text-sm text-green-700">
                Account ID:{" "}
                <span className="font-mono">{status.accountId}</span>
              </p>
              <p className="mt-0.5 text-xs text-green-600">
                Connected {formatDate(status.connectedAt)}
                {status.updatedAt !== status.connectedAt &&
                  ` · Updated ${formatDate(status.updatedAt)}`}
              </p>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50"
            >
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </div>
      )}

      {/* Credential Form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {status?.connected ? "Update Credentials" : "Connect to NetSuite"}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Enter your NetSuite TBA credentials. You can generate these in
          NetSuite under Setup &gt; Integration &gt; Manage Integrations, then
          create a token role.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="accountId"
              className="block text-sm font-medium text-gray-700"
            >
              Account ID
            </label>
            <input
              id="accountId"
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              placeholder="e.g. 1234567 or 1234567_SB1"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Found in Setup &gt; Company &gt; Company Information
            </p>
          </div>

          <div>
            <label
              htmlFor="consumerKey"
              className="block text-sm font-medium text-gray-700"
            >
              Consumer Key
            </label>
            <input
              id="consumerKey"
              type="password"
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
              required
              placeholder="Consumer key from your integration record"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="consumerSecret"
              className="block text-sm font-medium text-gray-700"
            >
              Consumer Secret
            </label>
            <input
              id="consumerSecret"
              type="password"
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
              required
              placeholder="Consumer secret from your integration record"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="tokenId"
              className="block text-sm font-medium text-gray-700"
            >
              Token ID
            </label>
            <input
              id="tokenId"
              type="password"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              required
              placeholder="Access token ID"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="tokenSecret"
              className="block text-sm font-medium text-gray-700"
            >
              Token Secret
            </label>
            <input
              id="tokenSecret"
              type="password"
              value={tokenSecret}
              onChange={(e) => setTokenSecret(e.target.value)}
              required
              placeholder="Access token secret"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving
              ? "Testing connection..."
              : status?.connected
                ? "Test & Update Connection"
                : "Test & Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
