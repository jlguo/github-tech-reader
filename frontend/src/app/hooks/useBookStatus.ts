import { useState, useEffect, useRef } from "react";
import { getDataService, type BookGenStatus, type GenStatus } from "../../services/api";

export type { GenStatus };
export type BookStatus = BookGenStatus;

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_INTERVAL_MS = 60_000;

export function useBookStatus(repoId: string | null, sourceType?: string): BookStatus | null {
  const [status, setStatus] = useState<BookStatus | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef(POLL_INTERVAL_MS);
  const usingFallback = useRef(false);

  const isYoutube = sourceType === "youtube";

  useEffect(() => {
    if (!repoId) return;

    let cancelled = false;

    const cleanup = () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };

    const scheduleNextPoll = () => {
      const delay = pollIntervalRef.current;
      pollIntervalRef.current = Math.min(pollIntervalRef.current * 2, POLL_MAX_INTERVAL_MS);
      pollTimeoutRef.current = setTimeout(poll, delay);
    };

    const resetPollInterval = () => {
      pollIntervalRef.current = POLL_INTERVAL_MS;
    };

    const poll = async () => {
      try {
        const svc = await getDataService();
        if (cancelled) return;
        const data = isYoutube
          ? await svc.getYoutubeBookStatus(repoId)
          : await svc.getBookStatus(repoId);
        if (data && !cancelled) {
          setStatus({
            status: data.status,
            current_phase: data.current_phase,
            total_chapters: data.total_chapters,
            completed_chapters: data.completed_chapters,
          });
          resetPollInterval();
        }
        if (!cancelled) {
          scheduleNextPoll();
        }
      } catch {
        if (!cancelled) {
          scheduleNextPoll();
        }
      }
    };

    getDataService().then((svc) => {
      if (cancelled) return;

      const startPolling = () => {
        if (pollTimeoutRef.current) return;
        resetPollInterval();
        poll();
      };

      const streamUrl = isYoutube
        ? svc.getYoutubeBookStatusStreamUrl(repoId)
        : svc.getBookStatusStreamUrl(repoId);
      const es = new EventSource(streamUrl);
      esRef.current = es;

      es.onmessage = (event) => {
        if (usingFallback.current) {
          usingFallback.current = false;
          resetPollInterval();
        }
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
          resetPollInterval();
          startPolling();
        }
      };
    });

    return cleanup;
  }, [repoId, isYoutube]);

  return status;
}

export const PRODUCING_STATUSES: GenStatus[] = [
  "pending", "fetching", "planning", "cover",
  "writing", "reviewing", "publishing",
];

export function isProducing(genStatus?: string): boolean {
  return PRODUCING_STATUSES.includes(genStatus as GenStatus);
}
