import { useState, useEffect, useRef } from "react";
import { getDataService, type BookGenStatus, type GenStatus } from "../../services/api";

export type { GenStatus };
export type BookStatus = BookGenStatus;

const POLL_FALLBACK_MS = 5_000;

export function useBookStatus(repoId: string | null): BookStatus | null {
  const [status, setStatus] = useState<BookStatus | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usingFallback = useRef(false);

  useEffect(() => {
    if (!repoId) return;

    let cancelled = false;

    const cleanup = () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    getDataService().then((svc) => {
      if (cancelled) return;

      const startPolling = () => {
        if (pollRef.current) return;
        const poll = async () => {
          try {
            const data = await svc.getBookStatus(repoId);
            if (data && !cancelled) {
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

      const es = new EventSource(svc.getBookStatusStreamUrl(repoId));
      esRef.current = es;

      es.onmessage = (event) => {
        usingFallback.current = false;
        if (cancelled) return;
        try {
          setStatus(JSON.parse(event.data));
        } catch {}
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!usingFallback.current && !cancelled) {
          usingFallback.current = true;
          startPolling();
        }
      };
    });

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
