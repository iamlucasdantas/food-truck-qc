import { describe, expect, it } from "vitest";
import {
  canGoTo, completeness, completeStep, nameFromHandle, nextNudge, parseSocialLink,
  readProgress, resumeStep, skipStep, truckStage, TOTAL_MINUTES, ONBOARDING_STEPS,
} from "./onboarding";

describe("profile completeness score", () => {
  const full = {
    businessName: "Ruiz Eats", description: "Street tacos made with love every day", logoUrl: "data:image/webp;base64,x",
    paymentMethods: ["Card"], truckName: "Taco One", cuisine: "Tacos", hasMenu: true, photoCount: 3, hasSchedule: true,
  };
  it("a complete profile scores 100", () => {
    expect(completeness(full).score).toBe(100);
  });
  it("an empty profile scores 0", () => {
    expect(completeness({ businessName: "", description: "", logoUrl: null, paymentMethods: [], truckName: "", cuisine: "", hasMenu: false, photoCount: 0, hasSchedule: false }).score).toBe(0);
  });
  it("photos add 15% and the nudge says so", () => {
    const noPhotos = completeness({ ...full, photoCount: 0 });
    expect(noPhotos.score).toBe(85);
    const nudge = nextNudge({ ...full, photoCount: 0, hasMenu: false });
    expect(nudge?.key).toBe("menu"); // ties broken by order: menu first
    expect(nextNudge({ ...full, photoCount: 0 })?.hint).toContain("photos");
  });
  it("a short description does not count", () => {
    expect(completeness({ ...full, description: "tacos" }).score).toBe(90);
  });
});

describe("step navigation", () => {
  it("can jump back to any visited step but not past an unfinished required step", () => {
    let p = readProgress({});
    expect(canGoTo(p, 0)).toBe(true);
    expect(canGoTo(p, 1)).toBe(false);
    p = completeStep(p, "business");
    expect(canGoTo(p, 1)).toBe(true);
    expect(canGoTo(p, 2)).toBe(false);
    p = completeStep(p, "truck");
    p = skipStep(p, "menu");
    expect(canGoTo(p, 4)).toBe(true);
    expect(canGoTo(p, 5)).toBe(true); // finish screen
    expect(canGoTo(p, 6)).toBe(false);
  });
  it("resume never skips an unfinished required step even with a saved later step", () => {
    const p = readProgress({ step: 4, done: ["business"] });
    expect(resumeStep(p)).toBe(1);
  });
  it("the welcome screen shows only before it was seen", () => {
    expect(readProgress({}).welcomed).toBe(false);
    expect(readProgress({ welcomed: true }).welcomed).toBe(true);
  });
  it("time estimate is the sum of step minutes", () => {
    expect(TOTAL_MINUTES).toBe(ONBOARDING_STEPS.reduce((n, s) => n + s.minutes, 0));
  });
});

describe("social link prefill parsing", () => {
  it("parses facebook page URLs", () => {
    expect(parseSocialLink("https://www.facebook.com/SkinnysFiyaTruck")).toEqual({ platform: "facebook", handle: "SkinnysFiyaTruck", url: "https://facebook.com/SkinnysFiyaTruck" });
    expect(parseSocialLink("facebook.com/skinnysfiya/")).toEqual({ platform: "facebook", handle: "skinnysfiya", url: "https://facebook.com/skinnysfiya" });
  });
  it("parses instagram URLs and bare handles", () => {
    expect(parseSocialLink("https://instagram.com/taco.one_qc")).toEqual({ platform: "instagram", handle: "taco.one_qc", url: "https://instagram.com/taco.one_qc" });
    expect(parseSocialLink("@tacoone")).toEqual({ platform: "instagram", handle: "tacoone", url: "https://instagram.com/tacoone" });
  });
  it("parses plain websites and rejects junk", () => {
    expect(parseSocialLink("https://tacoone.com/menu")).toEqual({ platform: "website", handle: "tacoone.com", url: "https://tacoone.com" });
    expect(parseSocialLink("")).toBeNull();
    expect(parseSocialLink("https://facebook.com/groups/123")).toBeNull();
    expect(parseSocialLink("not a url at all!!")).toBeNull();
  });
  it("guesses a display name from a handle", () => {
    expect(nameFromHandle("taco.one_qc")).toBe("Taco One Qc");
    expect(nameFromHandle("SkinnysFiyaTruck")).toBe("Skinnysfiyatruck");
  });
});

describe("approval status tracker", () => {
  it("maps truck status to tracker stages", () => {
    expect(truckStage("pending")).toBe("in_review");
    expect(truckStage("approved")).toBe("approved");
    expect(truckStage("active")).toBe("live");
    expect(truckStage(null)).toBe("submitted");
  });
});
