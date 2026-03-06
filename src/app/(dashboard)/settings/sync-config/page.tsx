"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
  detail?: string | null;
}

interface SyncConfigData {
  defaultCustomerId: string;
  defaultCustomerName: string;
  defaultSubsidiaryId: string;
  defaultSubsidiaryName: string;
  defaultPaymentMethodId: string;
  defaultPaymentMethodName: string;
  defaultTaxCodeId: string;
  defaultTaxCodeName: string;
  invoiceGrouping: "per_order" | "per_settlement";
}

const EMPTY_CONFIG: SyncConfigData = {
  defaultCustomerId: "",
  defaultCustomerName: "",
  defaultSubsidiaryId: "",
  defaultSubsidiaryName: "",
  defaultPaymentMethodId: "",
  defaultPaymentMethodName: "",
  defaultTaxCodeId: "",
  defaultTaxCodeName: "",
  invoiceGrouping: "per_order",
};

// ──────────────────────────────────────────
// Searchable Select Component
// ──────────────────────────────────────────

function SearchSelect({
  label,
  helpText,
  options,
  value,
  displayValue,
  onChange,
  placeholder,
  isLoading,
}: {
  label: string;
  helpText?: string;
  options: SelectOption[];
  value: string;
  displayValue: string;
  onChange: (id: string, name: string) => void;
  placeholder: string;
  isLoading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search) return options.slice(0, 50);
    const q = search.toLowerCase();
    return options
      .filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.id.includes(q) ||
          (o.detail && o.detail.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [options, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => {
            if (isLoading) return;
            setIsOpen(!isOpen);
            setSearch("");
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          disabled={isLoading}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-left text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isLoading ? (
            <span className="text-gray-400">Loading...</span>
          ) : displayValue ? (
            <span className="block truncate">{displayValue}</span>
          ) : (
            <span className="block truncate text-gray-400">{placeholder}</span>
          )}
        </button>

        {isOpen && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
            <div className="p-1.5">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange("", "");
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-400 hover:bg-gray-50"
                >
                  — None —
                </button>
              </li>
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-400">
                  No results for &quot;{search}&quot;
                </li>
              ) : (
                filtered.map((opt) => (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(opt.id, opt.name);
                        setIsOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-sm hover:bg-blue-50 ${
                        opt.id === value
                          ? "bg-blue-50 font-medium text-blue-700"
                          : "text-gray-900"
                      }`}
                    >
                      <span className="block truncate">{opt.name}</span>
                      {opt.detail && (
                        <span className="block text-xs text-gray-400">
                          {opt.detail}
                        </span>
                      )}
                    </button>
                  </li>
                ))
              )}
              {filtered.length === 50 && (
                <li className="px-3 py-1.5 text-xs text-gray-400 text-center">
                  Showing first 50 — type to narrow results
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
      {helpText && (
        <p className="mt-1 text-xs text-gray-400">{helpText}</p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────

export default function SyncConfigPage() {
  const [config, setConfig] = useState<SyncConfigData>(EMPTY_CONFIG);
  const [savedConfig, setSavedConfig] = useState<SyncConfigData>(EMPTY_CONFIG);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  const [customers, setCustomers] = useState<SelectOption[]>([]);
  const [subsidiaries, setSubsidiaries] = useState<SelectOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<SelectOption[]>([]);
  const [taxCodes, setTaxCodes] = useState<SelectOption[]>([]);

  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingSubsidiaries, setLoadingSubsidiaries] = useState(true);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(true);
  const [loadingTaxCodes, setLoadingTaxCodes] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // ── Fetch config ──

  const fetchConfig = useCallback(async () => {
    setIsLoadingConfig(true);
    try {
      const res = await fetch("/api/netsuite/sync-config");
      const data = await res.json();
      if (res.ok && data.config) {
        const c: SyncConfigData = {
          defaultCustomerId: data.config.defaultCustomerId || "",
          defaultCustomerName: data.config.defaultCustomerName || "",
          defaultSubsidiaryId: data.config.defaultSubsidiaryId || "",
          defaultSubsidiaryName: data.config.defaultSubsidiaryName || "",
          defaultPaymentMethodId: data.config.defaultPaymentMethodId || "",
          defaultPaymentMethodName: data.config.defaultPaymentMethodName || "",
          defaultTaxCodeId: data.config.defaultTaxCodeId || "",
          defaultTaxCodeName: data.config.defaultTaxCodeName || "",
          invoiceGrouping: data.config.invoiceGrouping || "per_order",
        };
        setConfig(c);
        setSavedConfig(c);
      }
    } catch {
      // non-blocking
    } finally {
      setIsLoadingConfig(false);
    }
  }, []);

  // ── Fetch lookup data ──

  const fetchLookup = useCallback(
    async (
      endpoint: string,
      key: string,
      setData: (d: SelectOption[]) => void,
      setLoading: (l: boolean) => void,
      mapFn: (item: any) => SelectOption
    ) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/netsuite/${endpoint}`);
        const data = await res.json();
        if (res.ok) {
          setData((data[key] || []).map(mapFn));
        }
      } catch {
        // non-blocking — dropdowns will be empty
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchConfig();
    fetchLookup(
      "customers",
      "customers",
      setCustomers,
      setLoadingCustomers,
      (c: any) => ({
        id: c.id,
        name: c.name,
        detail: c.email || `ID: ${c.id}`,
      })
    );
    fetchLookup(
      "subsidiaries",
      "subsidiaries",
      setSubsidiaries,
      setLoadingSubsidiaries,
      (s: any) => ({ id: s.id, name: s.name })
    );
    fetchLookup(
      "payment-methods",
      "paymentMethods",
      setPaymentMethods,
      setLoadingPaymentMethods,
      (p: any) => ({ id: p.id, name: p.name })
    );
    fetchLookup(
      "tax-codes",
      "taxCodes",
      setTaxCodes,
      setLoadingTaxCodes,
      (t: any) => ({
        id: t.id,
        name: t.name,
        detail: t.rate ? `Rate: ${t.rate}` : undefined,
      })
    );
  }, [fetchConfig, fetchLookup]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Save ──

  async function handleSave() {
    setError("");
    setIsSaving(true);

    try {
      const res = await fetch("/api/netsuite/sync-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }

      setSavedConfig({ ...config });
      setToast("Sync configuration saved");
    } catch {
      setError("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  }

  const hasChanges = JSON.stringify(config) !== JSON.stringify(savedConfig);

  if (isLoadingConfig) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Sync Configuration
        </h1>
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Sync Configuration
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Configure how Amazon transactions are synced to NetSuite. These
          defaults are used when creating sales orders, invoices, and payments.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Customer */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Customer & Subsidiary
          </h2>
          <div className="space-y-4">
            <SearchSelect
              label="Default Customer"
              helpText="The NetSuite customer record used for all Amazon orders. Typically a generic 'Amazon Marketplace' customer."
              options={customers}
              value={config.defaultCustomerId}
              displayValue={config.defaultCustomerName}
              onChange={(id, name) =>
                setConfig((prev) => ({
                  ...prev,
                  defaultCustomerId: id,
                  defaultCustomerName: name,
                }))
              }
              placeholder="Select a customer..."
              isLoading={loadingCustomers}
            />

            <SearchSelect
              label="Subsidiary"
              helpText="For multi-subsidiary accounts, select the subsidiary to post Amazon transactions to."
              options={subsidiaries}
              value={config.defaultSubsidiaryId}
              displayValue={config.defaultSubsidiaryName}
              onChange={(id, name) =>
                setConfig((prev) => ({
                  ...prev,
                  defaultSubsidiaryId: id,
                  defaultSubsidiaryName: name,
                }))
              }
              placeholder="Select a subsidiary..."
              isLoading={loadingSubsidiaries}
            />
          </div>
        </div>

        {/* Payment & Tax */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Payment & Tax
          </h2>
          <div className="space-y-4">
            <SearchSelect
              label="Default Payment Method"
              helpText="Payment method used when recording Amazon settlement payments (e.g. 'Amazon Pay', 'ACH/EFT')."
              options={paymentMethods}
              value={config.defaultPaymentMethodId}
              displayValue={config.defaultPaymentMethodName}
              onChange={(id, name) =>
                setConfig((prev) => ({
                  ...prev,
                  defaultPaymentMethodId: id,
                  defaultPaymentMethodName: name,
                }))
              }
              placeholder="Select a payment method..."
              isLoading={loadingPaymentMethods}
            />

            <SearchSelect
              label="Default Tax Code"
              helpText="Tax code applied to Amazon transactions. Amazon typically collects and remits sales tax as a marketplace facilitator."
              options={taxCodes}
              value={config.defaultTaxCodeId}
              displayValue={config.defaultTaxCodeName}
              onChange={(id, name) =>
                setConfig((prev) => ({
                  ...prev,
                  defaultTaxCodeId: id,
                  defaultTaxCodeName: name,
                }))
              }
              placeholder="Select a tax code..."
              isLoading={loadingTaxCodes}
            />
          </div>
        </div>

        {/* Invoice Grouping */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Invoice Grouping
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            How should Amazon orders be grouped into NetSuite invoices?
          </p>

          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="invoiceGrouping"
                value="per_order"
                checked={config.invoiceGrouping === "per_order"}
                onChange={() =>
                  setConfig((prev) => ({
                    ...prev,
                    invoiceGrouping: "per_order",
                  }))
                }
                className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">
                  One invoice per order
                </span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Creates a separate NetSuite invoice for each Amazon order.
                  Best for detailed order tracking and easier reconciliation of
                  individual transactions.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="invoiceGrouping"
                value="per_settlement"
                checked={config.invoiceGrouping === "per_settlement"}
                onChange={() =>
                  setConfig((prev) => ({
                    ...prev,
                    invoiceGrouping: "per_settlement",
                  }))
                }
                className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">
                  One invoice per settlement
                </span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Consolidates all orders in a settlement period into a single
                  NetSuite invoice. Best for high-volume sellers who want fewer
                  transactions in NetSuite.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {hasChanges
              ? "You have unsaved changes."
              : "All changes saved."}
          </p>
          <button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}
