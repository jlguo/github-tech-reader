import { useCallback, useEffect, useRef } from "react";
import { getDataService } from "../../services/api";

export interface ReaderProgressState {
  percent: number;
  completed: boolean;
  metadata: Record<string, unknown>;
}

export function useReadingProgress(bookId: string) {
  const lastSaved = useRef(0);
  const pending = useRef<ReaderProgressState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!pending.current) return;
    const state = pending.current;
    pending.current = null;
    lastSaved.current = state.percent;
    getDataService().then((svc) => {
      svc
        .updateReadingProgress(bookId, null, state.percent, state.completed, state.metadata)
        .catch(() => {});
    });
  }, [bookId]);

  useEffect(() => () => { flush(); }, [flush]);

  const save = useCallback(
    (state: ReaderProgressState) => {
      if (state.percent === lastSaved.current && state.percent < 100) return;

      pending.current = state;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 500);
    },
    [bookId, flush],
  );

  return { save };
}
