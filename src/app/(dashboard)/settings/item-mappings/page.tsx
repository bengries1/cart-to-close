"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

interface NetSuiteItem {
  id: string;
  name: string;
  sku: string;
  type: string;
  displayName: string | null;
}

interface SavedMapping {
  amazonSku: string;
  amazonTitle: string | null;
  netSuiteItemId: string;
  netSuiteItemName: string | null;
}

interface SkuRow {
  sku: string;
  title: string | null;
  orderCount: number | null; // from extraction, null for manual/saved
  netSuiteItemId: string;
  netSuiteItemName: string | null;
  isSaved: boolean;
}

// ──────────────────────────────────────────
// Searchable Dropdown Component
// ──────────────────────────────────────────

function ItemSearchDropdown({
  items,
  value,
  onChange,
  isMapped,
}: {
  items: NetSuiteItem[];
  value: string;
  onChange: (id: string, name: string) => void;
  isMapped: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search) return items.slice(0, 50);
    const q = search.toLowerCase();
    return items
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.displayName && i.displayName.toLowerCase().includes(q)) ||
          i.id.includes(q)
      )
      .slice(0, 50);
  }, [items, search]);

  const selectedItem = value ? items.find((i) => i.id === value) : null;

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
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch("");
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className={`w-full rounded-md border px-2 py-1.5 text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          !isMapped
            ? "border-amber-300 bg-amber-50 text-gray-900"
            : "border-gray-300 text-gray-900"
        }`}
      >
        {selectedItem ? (
          <span className="block truncate">
            {selectedItem.name}
            {selectedItem.displayName
              ? ` — ${selectedItem.displayName}`
              : ""}
          </span>
        ) : (
          <span className="block truncate text-gray-400">
            — Select NetSuite Item —
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="p-1.5">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {/* Clear option */}
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange("", "");
                  setIsOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-gray-400 hover:bg-gray-50"
              >
                — Clear selection —
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">
                No items match &quot;{search}&quot;
              </li>
            ) : (
              filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const label = item.displayName
                        ? `${item.name} — ${item.displayName}`
                        : item.name;
                      onChange(item.id, label);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-blue-50 ${
                      item.id === value
                        ? "bg-blue-50 font-medium text-blue-700"
                        : "text-gray-900"
                    }`}
                  >
                    <span className="block truncate">
                      {item.name}
                      {item.displayName ? (
                        <span className="text-gray-500">
                          {" "}
                          — {item.displayName}
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-gray-400">
                      {item.type} · ID: {item.id}
                    </span>
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
  );
}

// ──────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────

export default function ItemMappingsPage() {
  const [nsItems, setNsItems] = useState<NetSuiteItem[]>([]);
  const [itemsCachedAt, setItemsCachedAt] = useState<string | null>(null);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isRefreshingItems, setIsRefreshingItems] = useState(false);

  const [rows, setRows] = useState<SkuRow[]>([]);
  const [isLoadingMappings, setIsLoadingMappings] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "mapped" | "unmapped">("all");

  const extractInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch NetSuite items ──

  const fetchItems = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshingItems(true);
    } else {
      setIsLoadingItems(true);
    }

    try {
      const params = refresh ? "?refresh=true" : "";
      const res = await fetch(`/api/netsuite/items${params}`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          setError(
            "No NetSuite connection found. Connect in Settings > NetSuite first."
          );
        } else {
          setError(data.error || "Failed to load items");
        }
        return;
      }

      setNsItems(data.items || []);
      setItemsCachedAt(data.cachedAt || null);
    } catch {
      setError("Failed to load NetSuite items");
    } finally {
      setIsLoadingItems(false);
      setIsRefreshingItems(false);
    }
  }, []);

  // ── Fetch saved mappings ──

  const fetchMappings = useCallback(async () => {
    setIsLoadingMappings(true);
    try {
      const res = await fetch("/api/netsuite/item-mappings");
      const data = await res.json();

      if (res.ok) {
        const mappings: SavedMapping[] = data.mappings || [];
        setRows(
          mappings.map((m) => ({
            sku: m.amazonSku,
            title: m.amazonTitle,
            orderCount: null,
            netSuiteItemId: m.netSuiteItemId,
            netSuiteItemName: m.netSuiteItemName,
            isSaved: true,
          }))
        );
      }
    } catch {
      // non-blocking
    } finally {
      setIsLoadingMappings(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchMappings().then(() => {
      // Check for pending unmapped SKUs from order/shipment save
      try {
        const pending = sessionStorage.getItem("pendingUnmappedSkus");
        if (pending) {
          sessionStorage.removeItem("pendingUnmappedSkus");
          const skus: string[] = JSON.parse(pending);
          if (skus.length > 0) {
            setRows((prev) => {
              const existing = new Set(prev.map((r) => r.sku));
              const newRows: SkuRow[] = skus
                .filter((sku) => !existing.has(sku))
                .map((sku) => ({
                  sku,
                  title: null,
                  orderCount: null,
                  netSuiteItemId: "",
                  netSuiteItemName: null,
                  isSaved: false,
                }));
              if (newRows.length === 0) return prev;
              return [...prev, ...newRows].sort((a, b) =>
                a.sku.localeCompare(b.sku)
              );
            });
            setStatusFilter("unmapped");
            setToast(
              `${skus.length} unmapped SKU${skus.length === 1 ? "" : "s"} added from report`
            );
          }
        }
      } catch {
        // non-critical
      }
    });
  }, [fetchItems, fetchMappings]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Extract SKUs from settlement report ──

  async function handleExtractSkus(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setIsExtracting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/netsuite/item-mappings/extract-skus", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to extract SKUs");
        return;
      }

      const extractedSkus: Array<{ sku: string; orderCount: number }> =
        data.skus || [];

      // Merge with existing rows, keeping saved mappings
      setRows((prev) => {
        const existing = new Map(prev.map((r) => [r.sku, r]));

        for (const { sku, orderCount } of extractedSkus) {
          const ex = existing.get(sku);
          if (ex) {
            // Update order count
            existing.set(sku, { ...ex, orderCount });
          } else {
            // New SKU
            existing.set(sku, {
              sku,
              title: null,
              orderCount,
              netSuiteItemId: "",
              netSuiteItemName: null,
              isSaved: false,
            });
          }
        }

        return Array.from(existing.values()).sort((a, b) =>
          a.sku.localeCompare(b.sku)
        );
      });

      setToast(
        `Extracted ${extractedSkus.length} unique SKU${extractedSkus.length === 1 ? "" : "s"} from settlement ${data.settlementId || "report"}`
      );
    } catch {
      setError("Failed to extract SKUs");
    } finally {
      setIsExtracting(false);
      if (extractInputRef.current) extractInputRef.current.value = "";
    }
  }

  // ── CSV import ──

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setIsImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/netsuite/item-mappings/import-csv", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(
          data.error +
            (data.details?.length ? ` (${data.details.join("; ")})` : "")
        );
        return;
      }

      setToast(
        `Imported ${data.imported} mapping${data.imported === 1 ? "" : "s"}` +
          (data.errors?.length ? ` (${data.errors.length} rows skipped)` : "")
      );

      // Reload mappings from DB
      await fetchMappings();
    } catch {
      setError("Failed to import CSV");
    } finally {
      setIsImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }

  // ── Update a row ──

  function handleItemChange(sku: string, itemId: string, itemName: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.sku === sku
          ? {
              ...r,
              netSuiteItemId: itemId,
              netSuiteItemName: itemName || null,
            }
          : r
      )
    );
  }

  // ── Save all ──

  async function handleSaveAll() {
    setError("");
    setIsSaving(true);

    const toSave = rows.filter((r) => r.netSuiteItemId);

    if (toSave.length === 0) {
      setError("No mappings to save — select at least one NetSuite item.");
      setIsSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/netsuite/item-mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: toSave.map((r) => ({
            amazonSku: r.sku,
            amazonTitle: r.title,
            netSuiteItemId: r.netSuiteItemId,
            netSuiteItemName: r.netSuiteItemName,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }

      setToast(`Saved ${data.count} mapping${data.count === 1 ? "" : "s"}`);

      // Mark saved
      setRows((prev) =>
        prev.map((r) =>
          r.netSuiteItemId ? { ...r, isSaved: true } : r
        )
      );
    } catch {
      setError("Failed to save mappings");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Add manual SKU ──

  const [manualSku, setManualSku] = useState("");

  function handleAddManualSku() {
    const sku = manualSku.trim();
    if (!sku) return;
    if (rows.some((r) => r.sku === sku)) {
      setError(`SKU "${sku}" already exists in the list.`);
      return;
    }
    setRows((prev) =>
      [
        ...prev,
        {
          sku,
          title: null,
          orderCount: null,
          netSuiteItemId: "",
          netSuiteItemName: null,
          isSaved: false,
        },
      ].sort((a, b) => a.sku.localeCompare(b.sku))
    );
    setManualSku("");
  }

  // ── Filtering ──

  const filteredRows = rows.filter((r) => {
    if (statusFilter === "mapped" && !r.netSuiteItemId) return false;
    if (statusFilter === "unmapped" && r.netSuiteItemId) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        r.sku.toLowerCase().includes(q) ||
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.netSuiteItemName && r.netSuiteItemName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const unmappedCount = rows.filter((r) => !r.netSuiteItemId).length;
  const anyUnsaved = rows.some(
    (r) => r.netSuiteItemId && !r.isSaved
  );

  if (isLoadingItems || isLoadingMappings) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Item Mappings
        </h1>
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Item Mappings</h1>
        <p className="mt-1 text-sm text-gray-600">
          Map Amazon SKUs to NetSuite items. Extract SKUs from a settlement
          report, add them manually, or import via CSV.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Actions bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
        {/* Extract SKUs */}
        <div>
          <label
            className={`cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 ${
              isExtracting ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {isExtracting ? "Extracting..." : "Extract SKUs from Report"}
            <input
              ref={extractInputRef}
              type="file"
              accept=".txt,.csv,.tsv"
              onChange={handleExtractSkus}
              className="hidden"
              disabled={isExtracting}
            />
          </label>
        </div>

        {/* CSV import */}
        <div>
          <label
            className={`cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 ${
              isImporting ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {isImporting ? "Importing..." : "Import CSV"}
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvImport}
              className="hidden"
              disabled={isImporting}
            />
          </label>
        </div>

        {/* Manual add */}
        <div className="flex items-center gap-1">
          <input
            type="text"
            placeholder="Add SKU manually"
            value={manualSku}
            onChange={(e) => setManualSku(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddManualSku()}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900 w-36 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleAddManualSku}
            disabled={!manualSku.trim()}
            className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            Add
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {itemsCachedAt && (
            <span className="text-xs text-gray-400">
              Items cached{" "}
              {new Date(itemsCachedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
          <button
            onClick={() => fetchItems(true)}
            disabled={isRefreshingItems}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {isRefreshingItems ? "Refreshing..." : "Refresh Items"}
          </button>
        </div>
      </div>

      {/* CSV format help */}
      <details className="mb-4 text-xs text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700">
          CSV format for bulk import
        </summary>
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3 font-mono">
          <p className="mb-1 font-sans text-gray-600">
            Required columns: <code>amazon_sku</code>,{" "}
            <code>netsuite_item_id</code>
          </p>
          <p className="mb-2 font-sans text-gray-600">
            Optional columns: <code>amazon_title</code>,{" "}
            <code>netsuite_item_name</code>
          </p>
          amazon_sku,netsuite_item_id,amazon_title,netsuite_item_name
          <br />
          AB-1234,1001,&quot;Widget Blue 3-Pack&quot;,&quot;Widget Blue&quot;
          <br />
          CD-5678,1002,&quot;Gadget Red&quot;,&quot;Gadget Red&quot;
        </div>
      </details>

      {/* Summary + Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>
            {rows.length - unmappedCount} of {rows.length} mapped
          </span>
          {unmappedCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {unmappedCount} unmapped
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="Search SKUs..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | "mapped" | "unmapped")
            }
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="mapped">Mapped</option>
            <option value="unmapped">Unmapped</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
          No SKUs yet. Upload a settlement report to extract SKUs, add them
          manually, or import a CSV file.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">Amazon SKU</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3 w-20 text-right">Txns</th>
                  <th className="px-4 py-3" style={{ minWidth: 300 }}>
                    NetSuite Item
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row) => {
                  const isMapped = !!row.netSuiteItemId;

                  return (
                    <tr
                      key={row.sku}
                      className={
                        !row.isSaved && row.netSuiteItemId
                          ? "bg-blue-50/50"
                          : "hover:bg-gray-50"
                      }
                    >
                      {/* Status */}
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

                      {/* SKU */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-900">
                        {row.sku}
                      </td>

                      {/* Title */}
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                        {row.title || (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Txn count */}
                      <td className="px-4 py-3 text-right text-xs text-gray-400">
                        {row.orderCount != null ? row.orderCount : "—"}
                      </td>

                      {/* NS item dropdown */}
                      <td className="px-4 py-3">
                        <ItemSearchDropdown
                          items={nsItems}
                          value={row.netSuiteItemId}
                          onChange={(id, name) =>
                            handleItemChange(row.sku, id, name)
                          }
                          isMapped={isMapped}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredRows.length === 0 && rows.length > 0 && (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              No SKUs match your filter.
            </div>
          )}
        </div>
      )}

      {/* Save button */}
      {rows.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Only rows with a selected item will be saved.
          </p>
          <button
            onClick={handleSaveAll}
            disabled={isSaving || !anyUnsaved}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save All Mappings"}
          </button>
        </div>
      )}
    </div>
  );
}
