"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface SettlementTransaction {
  orderId: string;
  merchantOrderId: string;
  adjustmentId: string;
  shipmentId: string;
  marketplaceName: string;
  amountType: string;
  amountDescription: string;
  amount: number;
  fulfillmentId: string;
  postedDate: string;
  postedDateTime: string;
  orderItemCode: string;
  merchantOrderItemId: string;
  merchantAdjustmentItemId: string;
  sku: string;
  quantityPurchased: number;
  promotionId: string;
}

interface SettlementFeeSummary {
  amountType: string;
  amountDescription: string;
  totalAmount: number;
  transactionCount: number;
}

interface SettlementReport {
  settlementId: string;
  settlementStartDate: string;
  settlementEndDate: string;
  depositDate: string;
  totalAmount: number;
  currency: string;
  transactions: SettlementTransaction[];
  fees: SettlementFeeSummary[];
}

const TRANSACTIONS_PAGE_SIZE = 50;

export default function ReportPreviewPage() {
  const params = useParams();
  const documentId = params.documentId as string;

  const [report, setReport] = useState<SettlementReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Transaction table state
  const [txPage, setTxPage] = useState(1);
  const [txFilter, setTxFilter] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState("");

  const isUploaded = documentId === "uploaded";

  useEffect(() => {
    // If this is a manually uploaded report, load from sessionStorage
    if (isUploaded) {
      const stored = sessionStorage.getItem("uploadedSettlementReport");
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
      return;
    }

    // Otherwise fetch from Amazon via API
    async function fetchReport() {
      setIsLoading(true);
      setError("");

      try {
        const res = await fetch("/api/amazon/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportDocumentId: documentId }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to load report");
          return;
        }

        setReport(data.report);
      } catch {
        setError("Failed to load report");
      } finally {
        setIsLoading(false);
      }
    }

    fetchReport();
  }, [documentId, isUploaded]);

  function formatDate(iso?: string) {
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

  // Computed summaries
  const totalSales = report
    ? report.fees
        .filter((f) => f.totalAmount > 0)
        .reduce((sum, f) => sum + f.totalAmount, 0)
    : 0;

  const totalFees = report
    ? report.fees
        .filter((f) => f.totalAmount < 0)
        .reduce((sum, f) => sum + f.totalAmount, 0)
    : 0;

  const netDeposit = report?.totalAmount ?? 0;
  const currency = report?.currency || "USD";

  // Filtered & paginated transactions
  const filteredTransactions = report
    ? report.transactions.filter((tx) => {
        const matchesSearch =
          !txFilter ||
          tx.orderId.toLowerCase().includes(txFilter.toLowerCase()) ||
          tx.sku.toLowerCase().includes(txFilter.toLowerCase()) ||
          tx.amountDescription
            .toLowerCase()
            .includes(txFilter.toLowerCase());
        const matchesType =
          !txTypeFilter || tx.amountType === txTypeFilter;
        return matchesSearch && matchesType;
      })
    : [];

  const totalTxPages = Math.ceil(
    filteredTransactions.length / TRANSACTIONS_PAGE_SIZE
  );
  const paginatedTransactions = filteredTransactions.slice(
    (txPage - 1) * TRANSACTIONS_PAGE_SIZE,
    txPage * TRANSACTIONS_PAGE_SIZE
  );

  // Unique amount types for filter dropdown
  const amountTypes = report
    ? Array.from(
        new Set(report.transactions.map((tx) => tx.amountType))
      ).sort()
    : [];

  if (isLoading) {
    return (
      <div className="max-w-6xl">
        <div className="mb-6">
          <Link
            href="/amazon/reports"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            &larr; Back to Reports
          </Link>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
          Loading report...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl">
        <div className="mb-6">
          <Link
            href="/amazon/reports"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            &larr; Back to Reports
          </Link>
        </div>
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/amazon/reports"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            &larr; Back to Reports
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Settlement #{report.settlementId || "Uploaded Report"}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {formatDate(report.settlementStartDate)} &mdash;{" "}
            {formatDate(report.settlementEndDate)}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">Total Sales</p>
          <p className="mt-2 text-3xl font-bold text-green-700">
            {formatCurrency(totalSales, currency)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            All positive line items (product charges, shipping credits, etc.)
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">Total Fees</p>
          <p className="mt-2 text-3xl font-bold text-red-700">
            {formatCurrency(totalFees, currency)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            All negative line items (Amazon fees, FBA, commissions, etc.)
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">Net Deposit</p>
          <p
            className={`mt-2 text-3xl font-bold ${
              netDeposit >= 0 ? "text-gray-900" : "text-red-700"
            }`}
          >
            {formatCurrency(netDeposit, currency)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Deposit date: {formatDate(report.depositDate)}
          </p>
        </div>
      </div>

      {/* Fee Breakdown Table */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Fee Breakdown
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {report.fees.length} fee categories across{" "}
            {report.transactions.length.toLocaleString()} transactions
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3 text-right">Transactions</th>
                <th className="px-6 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.fees.map((fee, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-900 font-medium">
                    {fee.amountType}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {fee.amountDescription || "\u2014"}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-500">
                    {fee.transactionCount.toLocaleString()}
                  </td>
                  <td
                    className={`px-6 py-3 text-right font-medium ${
                      fee.totalAmount >= 0
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    {formatCurrency(fee.totalAmount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-6 py-3 text-gray-900" colSpan={2}>
                  Net Total
                </td>
                <td className="px-6 py-3 text-right text-gray-500">
                  {report.fees
                    .reduce((sum, f) => sum + f.transactionCount, 0)
                    .toLocaleString()}
                </td>
                <td
                  className={`px-6 py-3 text-right ${
                    netDeposit >= 0 ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {formatCurrency(netDeposit, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Transactions
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {filteredTransactions.length.toLocaleString()} of{" "}
                {report.transactions.length.toLocaleString()} transactions
                {txFilter || txTypeFilter ? " (filtered)" : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={txFilter}
                onChange={(e) => {
                  setTxFilter(e.target.value);
                  setTxPage(1);
                }}
                placeholder="Search order ID, SKU..."
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={txTypeFilter}
                onChange={(e) => {
                  setTxTypeFilter(e.target.value);
                  setTxPage(1);
                }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                {amountTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {paginatedTransactions.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            No transactions match your filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">Posted Date</th>
                    <th className="px-4 py-3">Order ID</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedTransactions.map((tx, i) => (
                    <tr
                      key={`${tx.orderId}-${tx.orderItemCode}-${tx.amountType}-${tx.amountDescription}-${i}`}
                      className="hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                        {tx.postedDate || "\u2014"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700">
                        {tx.orderId || "\u2014"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700">
                        {tx.sku || "\u2014"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-900">
                        {tx.amountType}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {tx.amountDescription || "\u2014"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-gray-500">
                        {tx.quantityPurchased || "\u2014"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                          tx.amount >= 0
                            ? "text-green-700"
                            : "text-red-700"
                        }`}
                      >
                        {formatCurrency(tx.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalTxPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
                <p className="text-xs text-gray-500">
                  Page {txPage} of {totalTxPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                    disabled={txPage === 1}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() =>
                      setTxPage((p) => Math.min(totalTxPages, p + 1))
                    }
                    disabled={txPage === totalTxPages}
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
