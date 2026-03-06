"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { parseSettlementReport } from "@/lib/amazon-sp-api";

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

interface ConnectionStatus {
  connected: boolean;
  sellerId?: string;
  accountId?: string;
  updatedAt?: string;
}

interface SyncJob {
  id: string;
  jobType: string;
  status: string;
  recordsProcessed: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface DailySale {
  date: string;
  amount: number;
}

interface FeeBreakdown {
  name: string;
  amount: number;
}

interface SettlementSummary {
  revenue: number;
  fees: number;
  netDeposit: number;
  dailySales: DailySale[];
  feeBreakdown: FeeBreakdown[];
  settlementId?: string;
  period?: string;
}

interface DashboardData {
  connections: {
    amazon: ConnectionStatus;
    netsuite: ConnectionStatus;
  };
  syncJobs: SyncJob[];
  totalSyncedRecords: number;
  settlementSummary: SettlementSummary | null;
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

const DONUT_COLORS = [
  "#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000)
    return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)
    return `$${(n / 1_000).toFixed(1)}K`;
  return formatCurrency(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const JOB_TYPE_LABELS: Record<string, string> = {
  settlement_report: "Settlement Report",
  sales_report: "Sales Report",
  inventory_report: "Inventory Report",
  orders_to_netsuite: "Orders Sync",
  refunds_to_netsuite: "Refunds Sync",
};

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  running: "bg-blue-100 text-blue-700",
  pending: "bg-gray-100 text-gray-700",
  failed: "bg-red-100 text-red-700",
};

// ──────────────────────────────────────────
// Main Dashboard
// ──────────────────────────────────────────

export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/dashboard/stats");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // non-blocking
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Upload settlement report to populate charts
  async function handleReportUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const text = await file.text();
      const report = parseSettlementReport(text);

      // Compute summary
      let revenue = 0;
      let fees = 0;
      const dailyMap = new Map<string, number>();
      const feeMap = new Map<string, number>();

      for (const tx of report.transactions) {
        const day = tx.postedDate || "";
        if (tx.amountType === "ItemPrice" || tx.amountType === "Promotion") {
          revenue += tx.amount;
          if (day) dailyMap.set(day, (dailyMap.get(day) || 0) + tx.amount);
        } else {
          fees += tx.amount;
          const key = tx.amountDescription || tx.amountType || "Other";
          feeMap.set(key, (feeMap.get(key) || 0) + tx.amount);
        }
      }

      const summary: SettlementSummary = {
        revenue,
        fees,
        netDeposit: report.totalAmount,
        dailySales: Array.from(dailyMap.entries())
          .map(([date, amount]) => ({ date, amount }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        feeBreakdown: Array.from(feeMap.entries())
          .map(([name, amount]) => ({ name, amount: Math.abs(amount) }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 10),
        settlementId: report.settlementId,
        period: `${report.settlementStartDate} — ${report.settlementEndDate}`,
      };

      // Cache on server
      await fetch("/api/dashboard/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(summary),
      });

      // Update local state
      setData((prev) =>
        prev ? { ...prev, settlementSummary: summary } : prev
      );
    } catch {
      // silent
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  const conns = data?.connections;
  const summary = data?.settlementSummary;
  const syncJobs = data?.syncJobs || [];
  const missingAmazon = !conns?.amazon?.connected;
  const missingNetsuite = !conns?.netsuite?.connected;
  const showAlert = missingAmazon || missingNetsuite;

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Welcome back
            {session?.user?.name ? `, ${session.user.name}` : ""}!
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label
            className={`cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 ${
              isUploading ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {isUploading ? "Processing..." : "Load Settlement Report"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv,.tsv"
              onChange={handleReportUpload}
              className="hidden"
              disabled={isUploading}
            />
          </label>
          <button
            onClick={fetchDashboard}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {showAlert && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <div className="text-sm">
              <p className="font-medium text-amber-800">
                Missing connections
              </p>
              <ul className="mt-1 text-amber-700 space-y-0.5">
                {missingAmazon && (
                  <li>
                    Amazon SP-API is not connected.{" "}
                    <a
                      href="/settings/amazon"
                      className="underline font-medium"
                    >
                      Connect now
                    </a>
                  </li>
                )}
                {missingNetsuite && (
                  <li>
                    NetSuite is not connected.{" "}
                    <a
                      href="/settings/netsuite"
                      className="underline font-medium"
                    >
                      Connect now
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Revenue This Period"
          value={summary ? formatCompact(summary.revenue) : "\u2014"}
          subtitle={summary?.period || "No settlement loaded"}
          color="blue"
        />
        <KpiCard
          title="Total Fees"
          value={summary ? formatCompact(Math.abs(summary.fees)) : "\u2014"}
          subtitle={
            summary
              ? `${((Math.abs(summary.fees) / Math.max(summary.revenue, 1)) * 100).toFixed(1)}% of revenue`
              : "No settlement loaded"
          }
          color="red"
        />
        <KpiCard
          title="Net Deposit"
          value={summary ? formatCompact(summary.netDeposit) : "\u2014"}
          subtitle="After all fees"
          color="green"
        />
        <KpiCard
          title="Records Synced"
          value={
            data?.totalSyncedRecords != null
              ? data.totalSyncedRecords.toLocaleString()
              : "\u2014"
          }
          subtitle="All-time to NetSuite"
          color="purple"
        />
      </div>

      {/* Charts Row */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Daily Sales Line Chart (spans 2 cols) */}
        <div className="lg:col-span-2 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Daily Sales
          </h3>
          {summary && summary.dailySales.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={summary.dailySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => {
                    const dt = new Date(d);
                    return `${dt.getMonth() + 1}/${dt.getDate()}`;
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    `$${(v / 1000).toFixed(0)}K`
                  }
                />
                <Tooltip
                  formatter={(v: any) => [formatCurrency(Number(v)), "Sales"]}
                  labelFormatter={(d: any) =>
                    new Date(String(d)).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-sm text-gray-400">
              Load a settlement report to see daily sales
            </div>
          )}
        </div>

        {/* Fee Breakdown Donut */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Fee Breakdown
          </h3>
          {summary && summary.feeBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={summary.feeBreakdown}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="amount"
                  nameKey="name"
                >
                  {summary.feeBreakdown.map((_, i) => (
                    <Cell
                      key={i}
                      fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any) => formatCurrency(Number(v))}
                />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  wrapperStyle={{ fontSize: 10 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-sm text-gray-400">
              No fee data
            </div>
          )}
        </div>
      </div>

      {/* Recent Sync Activity */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Recent Sync Activity
          </h3>
        </div>

        {syncJobs.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            No sync jobs yet. Sync activity will appear here once you start
            syncing data to NetSuite.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3">Job Type</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Records</th>
                  <th className="px-6 py-3">Started</th>
                  <th className="px-6 py-3">Completed</th>
                  <th className="px-6 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {syncJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-900">
                      {JOB_TYPE_LABELS[job.jobType] || job.jobType}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[job.status] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-700">
                      {job.recordsProcessed}
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs">
                      {formatDate(job.startedAt)}
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs">
                      {formatDate(job.completedAt)}
                    </td>
                    <td className="px-6 py-3 text-xs text-red-500 max-w-[200px] truncate">
                      {job.errorMessage || "\u2014"}
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

// ──────────────────────────────────────────
// KPI Card Component
// ──────────────────────────────────────────

function KpiCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: "blue" | "red" | "green" | "purple";
}) {
  const borderColors = {
    blue: "border-l-blue-500",
    red: "border-l-red-500",
    green: "border-l-green-500",
    purple: "border-l-purple-500",
  };

  return (
    <div
      className={`rounded-lg border border-gray-200 border-l-4 ${borderColors[color]} bg-white p-4`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {title}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
    </div>
  );
}
