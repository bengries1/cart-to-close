"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { parseShipmentReport } from "@/lib/amazon-shipments-parser";

interface SavedShipmentReport {
  id: string;
  reportDate: string | null;
  startDate: string | null;
  endDate: string | null;
  shipmentCount: number;
  totalAmount: number;
  currency: string;
  syncStatus: string;
  createdAt: string;
}

export default function AmazonShipmentsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savedReports, setSavedReports] = useState<SavedShipmentReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [unmappedSkus, setUnmappedSkus] = useState<string[]>([]);

  const fetchSavedReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/amazon/shipments/saved");
      if (res.ok) {
        const data = await res.json();
        setSavedReports(data.reports || []);
      }
    } catch {
      // non-blocking
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSavedReports();
  }, [fetchSavedReports]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");
    setIsUploading(true);

    try {
      if (file.size > 50 * 1024 * 1024) {
        setError("File is too large (max 50 MB)");
        return;
      }

      const text = await file.text();

      if (!text.trim()) {
        setError("File is empty");
        return;
      }

      const report = parseShipmentReport(text);

      // Try to store for preview; if too large, save directly to DB
      try {
        sessionStorage.setItem(
          "uploadedShipmentReport",
          JSON.stringify(report)
        );
        router.push("/amazon/shipments/uploaded");
      } catch {
        // Report too large for sessionStorage — save directly in batches
        await saveReportInBatches(report);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to parse report");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function saveReportInBatches(report: ReturnType<typeof parseShipmentReport>) {
    const BATCH_SIZE = 500;
    const shipments = report.shipments;

    // First batch: save with initial shipments to create the report
    const firstBatch = shipments.slice(0, BATCH_SIZE);
    const res = await fetch("/api/amazon/shipments/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        report: {
          ...report,
          shipments: firstBatch,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to save report");
      return;
    }

    // If there are more shipments, append them in batches
    if (shipments.length > BATCH_SIZE) {
      for (let i = BATCH_SIZE; i < shipments.length; i += BATCH_SIZE) {
        const batch = shipments.slice(i, i + BATCH_SIZE);
        const appendRes = await fetch("/api/amazon/shipments/append", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportId: data.reportId,
            shipments: batch,
          }),
        });
        if (!appendRes.ok) {
          const appendData = await appendRes.json();
          setError(appendData.error || `Failed to save batch at shipment ${i}`);
          return;
        }
      }
    }

    if (data.unmappedSkus?.length > 0) {
      setUnmappedSkus(data.unmappedSkus);
      try {
        sessionStorage.setItem(
          "pendingUnmappedSkus",
          JSON.stringify(data.unmappedSkus)
        );
      } catch {
        // non-critical
      }
    }

    setSuccess(
      `Report saved: ${report.shipmentCount.toLocaleString()} shipments, ${report.currency} ${report.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} total.`
    );
    fetchSavedReports();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this saved shipment report?")) return;
    setError("");
    try {
      const res = await fetch(`/api/amazon/shipments/saved?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete report");
        return;
      }
      setSuccess("Report deleted.");
      fetchSavedReports();
    } catch {
      setError("Failed to delete report");
    }
  }

  const [syncingId, setSyncingId] = useState<string | null>(null);

  async function handleSync(reportId: string) {
    setSyncingId(reportId);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/amazon/shipments/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to sync shipments");
        return;
      }

      const r = data.result;
      setSuccess(
        `Sync complete: ${r.created} created, ${r.skipped} skipped, ${r.failed} failed`
      );
      fetchSavedReports();
    } catch {
      setError("Failed to sync shipments");
    } finally {
      setSyncingId(null);
    }
  }

  function formatDate(iso?: string | null) {
    if (!iso) return "\u2014";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatCurrency(amount: number, currency?: string) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  }

  const syncStatusColor: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700",
    syncing: "bg-yellow-100 text-yellow-700",
    synced: "bg-green-100 text-green-700",
    partial: "bg-amber-100 text-amber-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Shipment Reports</h1>
        <p className="mt-1 text-sm text-gray-600">
          Upload Amazon FBA shipment reports to sync as Invoices in NetSuite.
          Download the &quot;Amazon Fulfilled Shipments&quot; report from Seller
          Central.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 p-3">
          <p className="text-sm text-green-600">{success}</p>
          {unmappedSkus.length > 0 && (
            <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-3">
              <p className="text-sm font-medium text-amber-800">
                {unmappedSkus.length} unmapped SKU{unmappedSkus.length === 1 ? "" : "s"} found
              </p>
              <p className="mt-1 text-xs text-amber-700">
                These SKUs need to be mapped to NetSuite items before syncing.
              </p>
              <ul className="mt-1.5 list-disc list-inside">
                {unmappedSkus.slice(0, 5).map((sku) => (
                  <li key={sku} className="font-mono text-xs text-amber-700">{sku}</li>
                ))}
                {unmappedSkus.length > 5 && (
                  <li className="text-xs text-amber-600">...and {unmappedSkus.length - 5} more</li>
                )}
              </ul>
              <Link
                href="/settings/item-mappings"
                className="mt-2 inline-block rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                Map Items Now
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Upload */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Upload Shipment Report
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Upload an &quot;Amazon Fulfilled Shipments&quot; report flat file (.txt
          or .csv) downloaded from Seller Central &gt; Reports &gt; Fulfillment
          &gt; Amazon Fulfilled Shipments.
        </p>
        <div className="flex items-center gap-3">
          <label
            className={`cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 ${
              isUploading ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {isUploading ? "Parsing..." : "Choose File & Preview"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv,.tsv"
              onChange={handleUpload}
              className="hidden"
              disabled={isUploading}
            />
          </label>
          <span className="text-xs text-gray-400">
            Tab-delimited flat file, max 10 MB
          </span>
        </div>
      </div>

      {/* Saved Reports */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Saved Shipment Reports ({savedReports.length})
          </h2>
        </div>

        {isLoading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            Loading...
          </div>
        ) : savedReports.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            No saved shipment reports yet. Upload a report above, then save it
            from the preview page.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3">Period</th>
                  <th className="px-6 py-3 text-right">Shipments</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3">Sync Status</th>
                  <th className="px-6 py-3">Imported</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {savedReports.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-900">
                      {formatDate(r.startDate)} &mdash; {formatDate(r.endDate)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-700">
                      {r.shipmentCount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      {formatCurrency(r.totalAmount, r.currency)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          syncStatusColor[r.syncStatus] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {r.syncStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {r.syncStatus === "pending" && (
                        <button
                          onClick={() => handleSync(r.id)}
                          disabled={syncingId === r.id}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          {syncingId === r.id ? "Syncing..." : "Sync to NetSuite"}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
