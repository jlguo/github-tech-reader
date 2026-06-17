import { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "../../config/api";

export type GenStatus =
  | "pending" | "fetching" | "planning" | "cover"
  | "writing" | "reviewing" | "publishing"
  | "done" | "failed" | "no_book" | "not_started";

export interface BookStatus {
  status: GenStatus;
  current_phase: string | null;
  total_chapters: number;
  completed_chapters: number;
}

const POLL_FALLBACK_MS = 5_000;

export function useBookStatus(repoId: string | null): BookStatus | null {
  const [status, setStatus] = useState<BookStatus | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usingFallback = useRef(false);

  useEffect(() => {
    if (!repoId) return;

    const cleanup = () => {
      esRef.current?.close();
      esRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const startPolling = () => {
      if (pollRef.current) return;
      const poll = async () => {
        try {
          const r = await fetch(`${API_BASE_URL}/agents/book-status/${repoId}`);
          if (r.ok) {
            const data = await r.json();
            setStatus({
              status: data.status,
              current_phase: data.current_phase,
              total_chapters: data.total_chapters,
              completed_chapters: data.completed_chapters,
            });
          }
        } catch {}
      };
      poll();
      pollRef.current = setInterval(poll, POLL_FALLBACK_MS);
    };

    const es = new EventSource(`${API_BASE_URL}/agents/book-status/${repoId}/stream`);
    esRef.current = es;

    es.onmessage = (event) => {
      usingFallback.current = false;
      try {
        setStatus(JSON.parse(event.data));
      } catch {}
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (!usingFallback.current) {
        usingFallback.current = true;
        startPolling();
      }
    };

    return cleanup;
  }, [repoId]);

  return status;
}

export const PRODUCING_STATUSES: GenStatus[] = [
  "pending", "fetching", "planning", "cover",
  "writing", "reviewing", "publishing",
];

export function isProducing(genStatus?: string): boolean {
  return PRODUCING_STATUSES.includes(genStatus as GenStatus);
}
