"use client";

// =============================================================================
// Approval Workflow Panel (P12 — v1.2, REQ-SIGN-002, REQ-SIGN-003)
//
// Controls the DRAFT → IN_REVIEW → APPROVED sign-off lifecycle.
// Human sign-off is the only approval path; no automated approval (REQ-SIGN-003).
// The exported document is not client-ready until APPROVED.
// =============================================================================

import { useState } from "react";
import { cn } from "@/lib/utils";

type MSStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "SUPERSEDED" | "WITHDRAWN";

interface Props {
  methodStatementId: string;
  initialStatus: MSStatus;
  initialReviewerOfRecord?: string | null;
  currentUserName?: string;
}

const STATUS_STEPS: { status: MSStatus; label: string }[] = [
  { status: "DRAFT", label: "Draft" },
  { status: "IN_REVIEW", label: "In review" },
  { status: "APPROVED", label: "Approved" },
];

export default function ApprovalPanel({
  methodStatementId,
  initialStatus,
  initialReviewerOfRecord,
  currentUserName,
}: Props) {
  const [status, setStatus] = useState<MSStatus>(initialStatus);
  const [reviewer, setReviewer] = useState(initialReviewerOfRecord ?? currentUserName ?? "");
  const [notes, setNotes] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);

  async function post(path: string, body: Record<string, string>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/method-statements/${methodStatementId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Action failed."); return; }
      setStatus(data.status as MSStatus);
      setShowWithdraw(false);
    } finally {
      setLoading(false);
    }
  }

  const currentStep = STATUS_STEPS.findIndex((s) => s.status === status);
  const isTerminal = status === "WITHDRAWN" || status === "SUPERSEDED";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Approval Status</h2>
        <span
          className={cn(
            "text-xs px-2.5 py-1 rounded-full font-medium",
            status === "APPROVED"
              ? "bg-green-50 text-green-700"
              : status === "IN_REVIEW"
              ? "bg-purple-50 text-purple-700"
              : status === "DRAFT"
              ? "bg-amber-50 text-amber-700"
              : "bg-gray-100 text-gray-500"
          )}
        >
          {status.replace("_", " ")}
        </span>
      </div>

      {/* Progress track */}
      {!isTerminal && (
        <div className="flex items-center gap-0">
          {STATUS_STEPS.map((step, i) => {
            const done = i <= currentStep;
            const active = i === currentStep;
            return (
              <div key={step.status} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors",
                      done
                        ? "bg-brand-600 border-brand-600 text-white"
                        : "bg-white border-gray-300 text-gray-400"
                    )}
                  >
                    {done && i < currentStep ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className={cn("text-xs mt-1", active ? "text-brand-700 font-medium" : "text-gray-400")}>
                    {step.label}
                  </span>
                </div>
                {i < STATUS_STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-1 mb-4",
                      i < currentStep ? "bg-brand-600" : "bg-gray-200"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {isTerminal && (
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          This method statement has been <strong>{status.toLowerCase()}</strong> and is no longer in the active workflow.
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Actions */}
      {!isTerminal && (
        <div className="space-y-3 pt-1">
          {status === "DRAFT" && (
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Reviewer of record (REQ-SIGN-002)</label>
                <input
                  type="text"
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  placeholder="Full name of responsible engineer"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <button
                onClick={() => post("review", { reviewerName: reviewer })}
                disabled={loading || !reviewer.trim()}
                className="w-full py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Submitting…" : "Submit for review"}
              </button>
            </div>
          )}

          {status === "IN_REVIEW" && (
            <div className="space-y-2">
              {reviewer && (
                <p className="text-xs text-gray-500">
                  Reviewer of record: <strong className="text-gray-700">{reviewer}</strong>
                </p>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Approval notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Any sign-off comments…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => post("approve", { notes })}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Approving…" : "Approve — human sign-off"}
                </button>
                <button
                  onClick={() => post("review", { reviewerName: reviewer })}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  title="Return to DRAFT for revisions"
                >
                  Return to draft
                </button>
              </div>
            </div>
          )}

          {status === "APPROVED" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-100">
              <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-green-700">
                Approved. Ready for client submission.
                {reviewer && <> Reviewer: <strong>{reviewer}</strong>.</>}
              </p>
            </div>
          )}

          {/* Withdraw */}
          {!showWithdraw ? (
            <button
              onClick={() => setShowWithdraw(true)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Withdraw this method statement
            </button>
          ) : (
            <div className="space-y-2 pt-1 border-t border-gray-100">
              <label className="block text-xs text-gray-500">Withdrawal reason</label>
              <input
                type="text"
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                placeholder="e.g. Scope change, superseded by revision"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => post("withdraw", { reason: withdrawReason })}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Withdrawing…" : "Confirm withdrawal"}
                </button>
                <button onClick={() => setShowWithdraw(false)} className="text-xs text-gray-500 hover:text-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
