import { expect, it } from "vitest";
import { socialSourceUrl } from "./social-source-url";

it("normalizes Instagram handles and missing schemes to actor-compatible URLs", () => {
  expect(socialSourceUrl("@ruralrumpsbbq", "instagram")).toBe("https://www.instagram.com/ruralrumpsbbq/");
  expect(socialSourceUrl("instagram.com/coffeeandcrumbtruck", "instagram")).toBe("https://www.instagram.com/coffeeandcrumbtruck");
});
it("rejects invalid Instagram paths and wrong-service URLs before starting Apify", () => {
  expect(socialSourceUrl("https://instagram.com/", "instagram")).toBeNull();
  expect(socialSourceUrl("https://instagram.com/@bad handle", "instagram")).toBeNull();
  expect(socialSourceUrl("https://facebook.com/truck", "instagram")).toBeNull();
  expect(socialSourceUrl("https://instagram.com.evil.example/truck", "instagram")).toBeNull();
});
it("preserves Facebook numeric profile IDs", () => {
  expect(socialSourceUrl("https://www.facebook.com/profile.php?id=61579142065119", "page")).toBe("https://www.facebook.com/profile.php?id=61579142065119");
});