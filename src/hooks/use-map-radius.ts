import { useEffect, useState } from "react";
import { mapRadius } from "@/data/coverage";

/** Keep dragging immediate; only persist the finished adjustment to the URL. */
export function useMapRadius(urlValue: unknown, persist: (radius: number) => void) {
  const urlRadius = mapRadius(urlValue);
  const [radius, setRadius] = useState(urlRadius);
  useEffect(() => setRadius(urlRadius), [urlRadius]);

  const commitRadius = (value: number) => {
    const next = mapRadius(value);
    setRadius(next);
    persist(next);
  };

  return { radius, setRadius, commitRadius };
}