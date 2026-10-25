import { useCallback, useState } from "react";

// Animate a newly resolved tie for clients that saw it waiting for a spin.
// Opening an already finished huddle should not replay an old result.
export function useTieBreakReveal(tieKey: string | null, winnerId: string | null, loading: boolean) {
  const [reveal, setReveal] = useState<{ tieKey: string | null; watched: boolean; completed: string | null }>({
    tieKey: null, watched: false, completed: null,
  });
  // Adjust before children render, so an invalidated ballot cannot briefly
  // show its old result or trigger the layout's winner navigation effect.
  if (!loading && (reveal.tieKey !== tieKey || tieKey && !winnerId && (!reveal.watched || reveal.completed))) {
    setReveal({ tieKey, watched: !!tieKey && !winnerId, completed: null });
  }
  const resultKey = tieKey && winnerId ? JSON.stringify([tieKey, winnerId]) : null;
  const visible = !loading && !!resultKey && reveal.tieKey === tieKey && reveal.watched && reveal.completed !== resultKey;
  const finish = useCallback(() => setReveal(current => ({ ...current, completed: resultKey })), [resultKey]);
  return { visible, resultKey, finish };
}
