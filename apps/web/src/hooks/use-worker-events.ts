"use client";

// =============================================================================
// useWorkerEvents hook (P12 — v1.2)
//
// Subscribes to the /api/method-statements/[msId]/events SSE stream.
// Provides real-time updates for worker job statuses and MS status changes,
// replacing manual setInterval polling in individual panels.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from "react";

export type WorkerJobStatus = "PENDING" | "RUNNING" | "COMPLETE" | "FAILED" | "CANCELLED";

export interface WorkerJobEvent {
  jobType: string;
  status: WorkerJobStatus;
  result?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

export interface WorkerEventsState {
  connected: boolean;
  msStatus: string | null;
  jobs: Record<string, WorkerJobEvent>;
}

export function useWorkerEvents(methodStatementId: string | null) {
  const [state, setState] = useState<WorkerEventsState>({
    connected: false,
    msStatus: null,
    jobs: {},
  });
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!methodStatementId) return;
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(
      `/api/method-statements/${methodStatementId}/events`
    );
    esRef.current = es;

    es.addEventListener("open", () => {
      setState((prev) => ({ ...prev, connected: true }));
    });

    es.addEventListener("snapshot", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      const jobMap: Record<string, WorkerJobEvent> = {};
      for (const job of data.jobs ?? []) {
        jobMap[job.jobType] = job;
      }
      setState((prev) => ({
        ...prev,
        connected: true,
        msStatus: data.msStatus ?? prev.msStatus,
        jobs: jobMap,
      }));
    });

    es.addEventListener("worker_job", (e: MessageEvent) => {
      const job: WorkerJobEvent = JSON.parse(e.data);
      setState((prev) => ({
        ...prev,
        jobs: { ...prev.jobs, [job.jobType]: job },
      }));
    });

    es.addEventListener("ms_status", (e: MessageEvent) => {
      const { status } = JSON.parse(e.data);
      setState((prev) => ({ ...prev, msStatus: status }));
    });

    es.addEventListener("heartbeat", () => {
      // Connection alive — no state change needed
    });

    es.addEventListener("error", () => {
      setState((prev) => ({ ...prev, connected: false }));
      // EventSource auto-reconnects on error; close explicitly on component unmount
    });
  }, [methodStatementId]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);

  return state;
}
