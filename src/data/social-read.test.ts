import { describe, expect, it } from "vitest";
import { chunk, describePostOutcome, followUpUrl, isLoginWallText, itemError, normalizeSocialItem, socialLinkType } from "./social-read";

describe("socialLinkType", () => {
  it("treats single Facebook posts, photos, reels and post share links as posts (read once, not scan sources)", () => {
    for (const u of [
      "https://www.facebook.com/RuralRumpsBBQ/posts/pfbid0Nx9xvm8en56",
      "https://www.facebook.com/photo/?fbid=1097573369795480&set=pcb.1097574559795361",
      "https://www.facebook.com/permalink.php?story_fbid=pfbid02C&id=61578959914254",
      "https://www.facebook.com/share/p/1AbCdEf/",
      "https://www.facebook.com/share/r/1FVjeBQt1x/",
      "https://www.facebook.com/reel/2260622504508714/",
      "https://www.facebook.com/groups/qcfoodtrucks/posts/123456/",
    ]) expect(socialLinkType(u)).toEqual({ service: "facebook", type: "post" });
  });
  it("treats profile share links, vanity pages and profile.php ids as pages", () => {
    expect(socialLinkType("https://www.facebook.com/share/1DdKsnXera/?mibextid=wwXIfr").type).toBe("page");
    expect(socialLinkType("https://www.facebook.com/coffeeandcrumbtruck").type).toBe("page");
    expect(socialLinkType("https://www.facebook.com/profile.php?id=61571644514628").type).toBe("page");
    expect(socialLinkType("https://www.facebook.com/groups/qcfoodtrucks").type).toBe("group");
  });
  it("separates Instagram posts from profiles and leaves other sites as websites", () => {
    expect(socialLinkType("https://www.instagram.com/p/DAbc123/")).toEqual({ service: "instagram", type: "post" });
    expect(socialLinkType("https://www.instagram.com/ruralrumpsbbq/")).toEqual({ service: "instagram", type: "page" });
    expect(socialLinkType("https://facebook.com.evil.example/x/posts/1")).toEqual({ service: "web", type: "website" });
  });
});

describe("normalizeSocialItem (real Apify shapes)", () => {
  it("reads a normal feed post", () => {
    const p = normalizeSocialItem("page", { url: "https://www.facebook.com/x/posts/1", time: "2026-10-21T13:29:03.000Z", text: "📍 SSAB 11-2PM", pageName: "Schaab's", inputUrl: "https://www.facebook.com/profile.php?id=61571644514628" });
    expect(p).toMatchObject({ url: "https://www.facebook.com/x/posts/1", text: "📍 SSAB 11-2PM", author: "Schaab's", time: "2026-10-21T13:29:03.000Z" });
  });
  it("reads a photo page (no text) via its image and points to the full post", () => {
    const item = { facebookUrl: "https://www.facebook.com/photo/?fbid=1", __typename: "Photo", created_time: 1791735937, image: { uri: "https://scontent.example/flyer.jpg" }, container_story: { url: "https://www.facebook.com/RuralRumpsBBQ/posts/pfbid0N" } };
    const p = normalizeSocialItem("page", item);
    expect(p?.images).toEqual(["https://scontent.example/flyer.jpg"]);
    expect(p?.url).toBe("https://www.facebook.com/RuralRumpsBBQ/posts/pfbid0N");
    expect(p?.time).toBe(new Date(1791735937 * 1000).toISOString());
    expect(followUpUrl(item)).toBe("https://www.facebook.com/RuralRumpsBBQ/posts/pfbid0N");
  });
  it("reads a reel caption from message.text", () => {
    const p = normalizeSocialItem("page", { facebookUrl: "https://www.facebook.com/reel/1/", message: { text: "Tonight at Public House 5-8PM" }, creation_time: 1791735937 });
    expect(p?.text).toBe("Tonight at Public House 5-8PM");
  });
  it("skips error rows and reports why", () => {
    const row = { url: "https://www.facebook.com/share/18JQhFeMD7/", error: "not_available", errorDescription: "This content isn't available" };
    expect(normalizeSocialItem("page", row)).toBeNull();
    expect(itemError(row)).toBe("This content isn't available");
  });
});

describe("isLoginWallText", () => {
  it("flags the header-only page context.dev gets from Facebook without login", () => {
    expect(isLoginWallText("# Coffee & Crumb | Davenport IA | Coffee & Crumb, Davenport. 3,339 followers · 59 talking about this.")).toBe(true);
  });
  it("accepts a page with real content", () => {
    expect(isLoginWallText("Schedule ".repeat(100))).toBe(false);
  });
});

it("splits sources into small scraper jobs of 8", () => {
  expect(chunk(Array.from({ length: 20 }, (_, i) => i), 8).map((c) => c.length)).toEqual([8, 8, 4]);
});

it("describes each post's outcome in the Enrich log", () => {
  const line = describePostOutcome({ time: "2026-10-21T13:29:03.000Z", text: "📍 SSAB 11-2PM" }, [{ status: "published", venue: "SSAB", date: "2026-10-21", start: "11:00", end: "14:00" }]);
  expect(line).toBe("Oct 21 post “📍 SSAB 11-2PM” → SSAB 2026-10-21 11:00–14:00: on the map");
  expect(describePostOutcome({ time: "", text: "" }, [])).toBe("undated post (photo only) → no date/place announced");
});
