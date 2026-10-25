import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMapRadius } from "./use-map-radius";

describe("map radius adjustments", () => {
  it("updates immediately while dragging without navigating per movement", () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useMapRadius(undefined, persist));
    expect(result.current.radius).toBe(10);
    for (const value of [20, 35, 60, 100]) {
      act(() => result.current.setRadius(value));
      expect(result.current.radius).toBe(value);
    }
    expect(persist).not.toHaveBeenCalled();
    act(() => result.current.commitRadius(100));
    expect(persist).toHaveBeenCalledExactlyOnceWith(100);
    expect(result.current.radius).toBe(100);
  });

  it("follows incoming saved radius changes", () => {
    const { result, rerender } = renderHook(({ url }) => useMapRadius(url, vi.fn()), { initialProps: { url: "25" } });
    expect(result.current.radius).toBe(25);
    rerender({ url: "50" });
    expect(result.current.radius).toBe(50);
    rerender({ url: "" });
    expect(result.current.radius).toBe(10);
  });

  it("resets an uncommitted adjustment even when the URL is already at the default", () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useMapRadius(undefined, persist));
    act(() => result.current.setRadius(75));
    act(() => result.current.commitRadius(10));
    expect(result.current.radius).toBe(10);
    expect(persist).toHaveBeenCalledExactlyOnceWith(10);
  });
});