import { useCallback, useEffect, useState } from "react";

const KEY = "ftqc-favorites";

// Temporary device-only favorites until accounts are added.
export function useFavorites() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    try { setIds(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { /* ignore */ }
  }, []);
  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const isFav = useCallback((id: string) => ids.includes(id), [ids]);
  return { ids, toggle, isFav };
}
