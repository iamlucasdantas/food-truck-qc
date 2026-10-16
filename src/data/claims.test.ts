import { describe, expect, it } from "vitest";
import { matchClaimCandidates, siteDomain, type Candidate, type Me } from "./claims";

const me: Me = {
  email: "ana@tacos.com", emailConfirmed: true, businessName: "Ana's Tacos", truckNames: [],
  website: "https://www.anastacos.com/menu", facebook: "facebook.com/anastacosqc", instagram: "@anas_tacos", reddit: null,
};
const t = (over: Partial<Candidate>): Candidate => ({
  id: "x", name: "Something else", status: "active", claimed_by: null, created_by: null, deleted_at: null, merged_into: null,
  website: null, facebook: null, instagram: null, reddit: null, description: null, ...over,
});

describe("claim matching", () => {
  it("matches the same truck name ignoring 'the', 'food truck' and punctuation", () => {
    expect(matchClaimCandidates(me, [t({ id: "a", name: "Anas Tacos Food Truck" })])).toEqual([{ id: "a", reasons: ["name"], automatic: false }]);
  });
  it("matches a social handle from the business profile", () => {
    expect(matchClaimCandidates(me, [t({ id: "a", instagram: "https://instagram.com/anas_tacos/" })])[0]!.reasons).toEqual(["handle"]);
  });
  it("matches the website by domain", () => {
    expect(siteDomain("https://www.anastacos.com/menu")).toBe("anastacos.com");
    expect(matchClaimCandidates(me, [t({ id: "a", website: "http://anastacos.com" })])[0]!.reasons).toEqual(["website"]);
  });
  it("a confirmed email match is the only automatic one", () => {
    const r = matchClaimCandidates(me, [t({ id: "a", status: "pending", description: "Owner contact: Ana · ana@tacos.com · 555" })]);
    expect(r).toEqual([{ id: "a", reasons: ["email"], automatic: true }]);
  });
  it("never suggests someone else's pending truck without an email match", () => {
    expect(matchClaimCandidates(me, [t({ status: "pending", name: "Ana's Tacos" })])).toEqual([]);
  });
  it("ignores email matches when the email is not confirmed", () => {
    expect(matchClaimCandidates({ ...me, emailConfirmed: false }, [t({ status: "pending", description: "Owner contact: Ana · ana@tacos.com" })])).toEqual([]);
  });
  it("skips claimed, deleted, merged and archived trucks", () => {
    const base = { name: "Ana's Tacos" };
    expect(matchClaimCandidates(me, [
      t({ ...base, claimed_by: "u1" }), t({ ...base, deleted_at: "2026-01-01" }), t({ ...base, merged_into: "y" }), t({ ...base, status: "archived" }),
    ])).toEqual([]);
  });
  it("finds nothing for unrelated trucks", () => {
    expect(matchClaimCandidates(me, [t({ name: "BBQ Barn" })])).toEqual([]);
  });
});
