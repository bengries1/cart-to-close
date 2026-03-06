"use client";

import { useState, useEffect, useCallback } from "react";

// ──────────────────────────────────────────
// Standard Amazon fee types
// ──────────────────────────────────────────

const AMAZON_FEE_TYPES = [
  { key: "Commission", label: "Referral Fee (Commission)", category: "Selling Fees" },
  { key: "FBAPerUnitFulfillmentFee", label: "FBA Per-Unit Fulfillment Fee", category: "FBA Fees" },
  { key: "FBAPerOrderFulfillmentFee", label: "FBA Per-Order Fulfillment Fee", category: "FBA Fees" },
  { key: "FBAWeightBasedFee", label: "FBA Weight-Based Fee", category: "FBA Fees" },
  { key: "FBAInventoryStorageFee", label: "FBA Monthly Storage Fee", category: "FBA Fees" },
  { key: "FBALongTermStorageFee", label: "FBA Long-Term Storage Fee", category: "FBA Fees" },
  { key: "FBARemovalFee", label: "FBA Removal Fee", category: "FBA Fees" },
  { key: "FBADisposalFee", label: "FBA Disposal Fee", category: "FBA Fees" },
  { key: "FBAInboundTransportationFee", label: "FBA Inbound Shipping Fee", category: "FBA Fees" },
  { key: "FBACustomerReturnPerUnitFee", label: "FBA Customer Return Fee", category: "FBA Fees" },
  { key: "ShippingChargeback", label: "Shipping Chargeback", category: "Shipping" },
  { key: "ShippingHB", label: "Shipping Hold-Back", category: "Shipping" },
  { key: "FixedClosingFee", label: "Fixed Closing Fee", category: "Selling Fees" },
  { key: "VariableClosingFee", label: "Variable Closing Fee", category: "Selling Fees" },
  { key: "RefundCommission", label: "Refund Commission", category: "Refunds" },
  { key: "GiftwrapChargeback", label: "Gift Wrap Chargeback", category: "Selling Fees" },
  { key: "PromotionShipping", label: "Promotional Shipping Rebate", category: "Promotions" },
  { key: "SalesTaxCollectionFee", label: "Sales Tax Collection Fee", category: "Tax" },
  { key: "MarketplaceFacilitatorTax", label: "Marketplace Facilitator Tax", category: "Tax" },
  { key: "SubscriptionFee", label: "Subscription Fee", category: "Account Fees" },
  { key: "AdvertisingFee", label: "Advertising Fee", category: "Advertising" },
  { key: "HighVolumeListingFee", label: "High-Volume Listing Fee", category: "Selling Fees" },
  { key: "ProductSales", label: "Product Sales", category: "Revenue" },
  { key: "ProductSalesTax", label: "Product Sales Tax", category: "Tax" },
  { key: "ShippingCredits", label: "Shipping Credits", category: "Revenue" },
  { key: "GiftWrapCredits", label: "Gift Wrap Credits", category: "Revenue" },
  { key: "PromotionalRebates", label: "Promotional Rebates", category: "Promotions" },
  { key: "OtherTransactionFees", label: "Other Transaction Fees", category: "Other" },
  { key: "Other", label: "Other / Unclassified", category: "Other" },
] as const;

const CATEGORIES = Array.from(new Set(AMAZON_FEE_TYPES.map((f) => f.category)));

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

interface GlAccount {
  id: string;
  name: string;
  number: string;
  type: string;
}

interface SavedMapping {
  amazonFeeType: string;
  netSuiteAccountId: string;
  netSuiteAccountName?: string | null;
}

export default function FeeMappingsPage() {
  const [accounts, setAccounts] = useState<GlAccount[]>([]);
  const [accountsCachedAt, setAccountsCachedAt] = useState<string | null>(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isRefreshingAccounts, setIsRefreshingAccounts] = useState(false);

  const [savedMappings, setSavedMappings] = useState<SavedMapping[]>([]);
  const [isLoadingMappings, setIsLoadingMappings] = useState(true);

  // Current selections: feeType → accountId
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // Filter
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchFilter, setSearchFilter] = useState("");

  const fetchAccounts = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshingAccounts(true);
    } else {
      setIsLoadingAccounts(true);
    }

    try {
      const params = refresh ? "?refresh=true" : "";
      const res = await fetch(`/api/netsuite/accounts${params}`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          setError("No NetSuite connection found. Connect in Settings > NetSuite first.");
        } else {
          setError(data.error || "Failed to load GL accounts");
        }
        return;
      }

      setAccounts(data.accounts || []);
      setAccountsCachedAt(data.cachedAt || null);
    } catch {
      setError("Failed to load GL accounts");
    } finally {
      setIsLoadingAccounts(false);
      setIsRefreshingAccounts(false);
    }
  }, []);

  const fetchMappings = useCallback(async () => {
    setIsLoadingMappings(true);
    try {
      const res = await fetch("/api/netsuite/fee-mappings");
      const data = await res.json();

      if (res.ok) {
        const mappings: SavedMapping[] = data.mappings || [];
        setSavedMappings(mappings);

        // Populate selections from saved mappings
        const sel: Record<string, string> = {};
        for (const m of mappings) {
          sel[m.amazonFeeType] = m.netSuiteAccountId;
        }
        setSelections(sel);
      }
    } catch {
      // non-blocking
    } finally {
      setIsLoadingMappings(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchMappings();
  }, [fetchAccounts, fetchMappings]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function handleSelect(feeType: string, accountId: string) {
    setSelections((prev) => {
      if (!accountId) {
        const next = { ...prev };
        delete next[feeType];
        return next;
      }
      return { ...prev, [feeType]: accountId };
    });
  }

  async function handleSaveAll() {
    setError("");
    setIsSaving(true);

    // Only save rows that have a selection
    const mappings = Object.entries(selections)
      .filter(([, accountId]) => accountId)
      .map(([feeType, accountId]) => {
        const account = accounts.find((a) => a.id === accountId);
        return {
          amazonFeeType: feeType,
          netSuiteAccountId: accountId,
          netSuiteAccountName: account
            ? `${account.number} - ${account.name}`
            : null,
        };
      });

    if (mappings.length === 0) {
      setError("No mappings to save — select at least one GL account.");
      setIsSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/netsuite/fee-mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save mappings");
        return;
      }

      setToast(`Saved ${data.count} fee mapping${data.count === 1 ? "" : "s"}`);
      await fetchMappings();
    } catch {
      setError("Failed to save mappings");
    } finally {
      setIsSaving(false);
    }
  }

  // Determine which fee types have unsaved changes
  function hasChanged(feeType: string): boolean {
    const saved = savedMappings.find((m) => m.amazonFeeType === feeType);
    const current = selections[feeType];
    if (!saved && !current) return false;
    if (!saved && current) return true;
    if (saved && !current) return true;
    return saved!.netSuiteAccountId !== current;
  }

  const anyChanges = AMAZON_FEE_TYPES.some((f) => hasChanged(f.key));

  // Filter fee types
  const filteredFeeTypes = AMAZON_FEE_TYPES.filter((f) => {
    if (categoryFilter !== "All" && f.category !== categoryFilter) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        f.label.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const unmappedCount = AMAZON_FEE_TYPES.filter(
    (f) => !selections[f.key]
  ).length;

  if (isLoadingAccounts || isLoadingMappings) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Fee Mappings
        </h1>
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fee Mappings</h1>
        <p className="mt-1 text-sm text-gray-600">
          Map each Amazon fee type to a GL account in NetSuite. These mappings
          are used when syncing settlement reports.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Summary bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>
            {AMAZON_FEE_TYPES.length - unmappedCount} of{" "}
            {AMAZON_FEE_TYPES.length} mapped
          </span>
          {unmappedCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {unmappedCount} unmapped
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {accountsCachedAt && (
            <span className="text-xs text-gray-400">
              Accounts cached{" "}
              {new Date(accountsCachedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
          <button
            onClick={() => fetchAccounts(true)}
            disabled={isRefreshingAccounts}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {isRefreshingAccounts ? "Refreshing..." : "Refresh Accounts"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search fee types..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="All">All Categories</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Mapping table */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">Amazon Fee Type</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">NetSuite GL Account</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredFeeTypes.map((fee) => {
                const isMapped = !!selections[fee.key];
                const changed = hasChanged(fee.key);

                return (
                  <tr
                    key={fee.key}
                    className={changed ? "bg-blue-50/50" : "hover:bg-gray-50"}
                  >
                    {/* Status indicator */}
                    <td className="px-4 py-3 text-center">
                      {!isMapped ? (
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600"
                          title="Not mapped"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                            />
                          </svg>
                        </span>
                      ) : (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600">
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m4.5 12.75 6 6 9-13.5"
                            />
                          </svg>
                        </span>
                      )}
                    </td>

                    {/* Fee type */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {fee.label}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">
                        {fee.key}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 text-gray-500">{fee.category}</td>

                    {/* GL account dropdown */}
                    <td className="px-4 py-3">
                      <select
                        value={selections[fee.key] || ""}
                        onChange={(e) => handleSelect(fee.key, e.target.value)}
                        className={`w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          !isMapped
                            ? "border-amber-300 bg-amber-50 text-gray-900"
                            : "border-gray-300 text-gray-900"
                        }`}
                      >
                        <option value="">— Select GL Account —</option>
                        {accounts.map((acct) => (
                          <option key={acct.id} value={acct.id}>
                            {acct.number} - {acct.name} ({acct.type})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredFeeTypes.length === 0 && (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            No fee types match your filter.
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Only rows with a selected account will be saved.
        </p>
        <button
          onClick={handleSaveAll}
          disabled={isSaving || !anyChanges}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save All Mappings"}
        </button>
      </div>
    </div>
  );
}
