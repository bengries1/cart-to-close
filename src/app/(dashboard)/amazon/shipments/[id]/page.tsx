"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface ShipmentItem {
  sku: string;
  productName: string;
  quantityShipped: number;
  itemPrice: number;
  itemTax: number;
  shippingPrice: number;
  shippingTax: number;
  giftWrapPrice: number;
  giftWrapTax: number;
  itemPromotionDiscount: number;
  shipPromotionDiscount: number;
}

interface ParsedShipment {
  amazonOrderId: string;
  merchantOrderId: string;
  shipmentId: string;
  purchaseDate: string;
  shipmentDate: string;
  buyerName: string;
  currency: string;
  recipientName: string;
  shipCity: string;
  shipState: string;
  shipPostalCode: string;
  shipCountry: string;
  trackingNumber: string;
  fulfillmentChannel: string;
  salesChannel: string;
  items: ShipmentItem[];
  shipmentTotal: number;
  shipmentTax: number;
}

interface ShipmentReportSummary {
  shipments: ParsedShipment[];
  shipmentCount: number;
  totalAmount: number;
  currency: string;
  startDate: string;
  endDate: string;
}

const PAGE_SIZE = 25;

export default function ShipmentReportPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;
  const isUploaded = reportId === "uploaded";

  const [report, setReport] = useState<ShipmentReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [unmappedSkus, setUnmappedSkus] = useState<string[]>([]);

  const [page, setPage] = useState(1);
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    if (isUploaded) {
      const stored = sessionStorage.getItem("uploadedShipmentReport");
      if (stored) {
        try {
          setReport(JSON.parse(stored));
        } catch {
          setError("Failed to load uploaded report data");
        }
      } else {
        setError("No uploaded report data found. Please upload a file again.");
      }
      setIsLoading(false);
    } else {
      setError("Direct report viewing not yet implemented.");
      setIsLoading(false);
    }
  }, [isUploaded, reportId]);

  async function handleSave() {
    if (!report) return;
    setIsSaving(true);
    setError("");
    setSaveSuccess("");
    setUnmappedSkus([]);

    try {
      const res = await fetch("/api/amazon/shipments/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save report");
        return;
      }

      setSaveSuccess("Shipment report saved to your account.");
      if (data.unmappedSkus && data.unmappedSkus.length > 0) {
        setUnmappedSkus(data.unmappedSkus);
      }
    } catch {
      setError("Failed to save report");
    } finally {
      setIsSaving(false);
    }
  }

  function formatDate(iso?: string) {
    if (!iso) return "\u2014";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatCurrency(amount: number, curr?: string) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr || "USD",
    }).format(amount);
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl">
        <Link href="/amazon/shipments" className="text-sm text-blue-600 hover:text-blue-800">
          &larr; Back to Shipment Reports
        </Link>
        <div className="mt-4 rounded-lg border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
          Loading report...
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="max-w-6xl">
        <Link href="/amazon/shipments" className="text-sm text-blue-600 hover:text-blue-800">
          &larr; Back to Shipment Reports
        </Link>
        <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-600">{error}</div>
      </div>
    );
  }

  if (!report) return null;

  const currency = report.currency || "USD";
  const totalTax = report.shipments.reduce((sum, s) => sum + s.shipmentTax, 0);

  const filteredShipments = report.shipments.filter((s) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (
      s.amazonOrderId.toLowerCase().includes(q) ||
      s.shipmentId.toLowerCase().includes(q) ||
      s.trackingNumber.toLowerCase().includes(q) ||
      s.recipientName.toLowerCase().includes(q) ||
      s.items.some(
        (item) =>
          item.sku.toLowerCase().includes(q) ||
          item.productName.toLowerCase().includes(q)
      )
    );
  });

  const totalPages = Math.ceil(filteredShipments.length / PAGE_SIZE);
  const paginatedShipments = filteredShipments.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/amazon/shipments" className="text-sm text-blue-600 hover:text-blue-800">
            &larr; Back to Shipment Reports
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Shipment Report Preview
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {formatDate(report.startDate)} &mdash; {formatDate(report.endDate)}
          </p>
        </div>
        {!saveSuccess && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save to Account"}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {saveSuccess && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 p-4">
          <p className="text-sm font-medium text-green-700">{saveSuccess}</p>
          {unmappedSkus.length > 0 && (
            <div className="mt-2">
              <p className="text-sm text-green-800">
                {unmappedSkus.length} unmapped SKU{unmappedSkus.length === 1 ? "" : "s"} found:
              </p>
              <ul className="mt-1 list-disc list-inside text-sm text-green-700">
                {unmappedSkus.slice(0, 10).map((sku) => (
                  <li key={sku} className="font-mono text-xs">{sku}</li>
                ))}
                {unmappedSkus.length > 10 && (
                  <li className="text-xs">...and {unmappedSkus.length - 10} more</li>
                )}
              </ul>
              <button
                onClick={() => router.push("/settings/item-mappings")}
                className="mt-2 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
              >
                Map Items
              </button>
            </div>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Shipments</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {report.shipmentCount.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Total Revenue</p>
          <p className="mt-1 text-2xl font-bold text-green-700">
            {formatCurrency(report.totalAmount, currency)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Total Tax</p>
          <p className="mt-1 text-2xl font-bold text-gray-700">
            {formatCurrency(totalTax, currency)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Unique SKUs</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {new Set(report.shipments.flatMap((s) => s.items.map((i) => i.sku))).size}
          </p>
        </div>
      </div>

      {/* Shipments Table */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Shipments</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {filteredShipments.length.toLocaleString()} of{" "}
                {report.shipments.length.toLocaleString()} shipments
                {searchFilter ? " (filtered)" : ""}
              </p>
            </div>
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => { setSearchFilter(e.target.value); setPage(1); }}
              placeholder="Search order ID, tracking, SKU..."
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {paginatedShipments.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            No shipments match your filter.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">Order ID</th>
                    <th className="px-4 py-3">Ship Date</th>
                    <th className="px-4 py-3">Tracking</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3 text-right">Items</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Ship To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedShipments.map((shipment, idx) => (
                    <tr key={`${shipment.shipmentId}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {shipment.amazonOrderId}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                        {formatDate(shipment.shipmentDate)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {shipment.trackingNumber || "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {shipment.recipientName || "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {shipment.items.length}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatCurrency(shipment.shipmentTotal, currency)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {[shipment.shipCity, shipment.shipState, shipment.shipCountry]
                          .filter(Boolean)
                          .join(", ") || "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
                <p className="text-xs text-gray-500">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
