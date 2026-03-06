"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface Report {
  reportId: string;
  reportType: string;
  processingStatus: string;
  dataStartTime?: string;
  dataEndTime?: string;
  createdTime: string;
  reportDocumentId?: string;
}

export default function AmazonReportsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const fetchReports = useCallback(async (token?: string) => {
    setIsLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ pageSize: "20" });
      if (token) params.set("nextToken", token);

      const res = await fetch(`/api/amazon/reports?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        // Don't show error if it's just "no connection" — they may only use upload
        if (res.status === 404) {
          setReports([]);
          return;
        }
        setError(data.error || "Failed to fetch reports");
        setReports([]);
        return;
      }

      setReports(data.reports || []);
      setNextToken(data.nextToken || null);
    } catch {
      setError("Failed to fetch reports");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/amazon/reports/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to parse report");
        return;
      }

      // Store parsed report in sessionStorage and navigate to preview
      sessionStorage.setItem(
        "uploadedSettlementReport",
        JSON.stringify(data.report)
      );
      router.push("/amazon/reports/uploaded");
    } catch {
      setError("Failed to upload report");
    } finally {
      setIsUploading(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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

  const statusColor: Record<string, string> = {
    DONE: "bg-green-100 text-green-700",
    IN_PROGRESS: "bg-yellow-100 text-yellow-700",
    IN_QUEUE: "bg-blue-100 text-blue-700",
    CANCELLED: "bg-gray-100 text-gray-700",
    FATAL: "bg-red-100 text-red-700",
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Settlement Reports
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          View Amazon settlement reports from your connected account, or upload
          a report file manually.
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

      {/* Manual Upload */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Upload Report File
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Upload a settlement report flat file (.txt or .csv) downloaded from
          Seller Central. The file will be parsed and displayed immediately.
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

      {/* Reports Table */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Reports from Amazon
          </h2>
          <button
            onClick={() => fetchReports()}
            disabled={isLoading}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {isLoading && reports.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            Loading reports...
          </div>
        ) : reports.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            No reports from Amazon. You can{" "}
            <a
              href="/settings/amazon"
              className="text-blue-600 hover:underline"
            >
              connect your Amazon account
            </a>{" "}
            or upload a report file above.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-3">Report ID</th>
                    <th className="px-6 py-3">Settlement Period</th>
                    <th className="px-6 py-3">Created</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reports.map((report) => (
                    <tr key={report.reportId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-mono text-xs text-gray-700">
                        {report.reportId}
                      </td>
                      <td className="px-6 py-4 text-gray-900">
                        {formatDate(report.dataStartTime)} &mdash;{" "}
                        {formatDate(report.dataEndTime)}
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {formatDate(report.createdTime)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            statusColor[report.processingStatus] ||
                            "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {report.processingStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {report.processingStatus === "DONE" &&
                        report.reportDocumentId ? (
                          <button
                            onClick={() =>
                              router.push(
                                `/amazon/reports/${report.reportDocumentId}`
                              )
                            }
                            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                          >
                            View Report
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">
                            Not ready
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {nextToken && (
              <div className="border-t border-gray-100 px-6 py-3 text-center">
                <button
                  onClick={() => fetchReports(nextToken)}
                  disabled={isLoading}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
