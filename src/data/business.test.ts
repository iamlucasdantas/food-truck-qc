import { describe, expect, it } from "vitest";
import { buildSignup, ownerFormSteps, parseContact, signupStepsFor, type ExistingBusiness, type SignupInput } from "./business";

const input: SignupInput = {
  contactName: "Ana Ruiz", email: "ana@tacos.com", phone: "563-555-0100", businessName: "Ruiz Eats", description: "Family tacos",
  website: "https://ruiz.com", instagram: "ruizeats", facebook: "", truckName: "Taco One", truckType: "mobile", category: "Tacos", city: "Davenport",
};

describe("business info is asked once", () => {
  it("first truck asks for business info", () => {
    expect(signupStepsFor(false)[0]).toContain("businessName");
    expect(signupStepsFor(false)[0]).toContain("website");
    expect(ownerFormSteps(false)).toHaveLength(2);
  });
  it("second truck does not ask for business info", () => {
    expect(signupStepsFor(true).flat()).not.toContain("businessName");
    expect(signupStepsFor(true).flat()).not.toContain("instagram");
    expect(ownerFormSteps(true)).toEqual([["truckName", "truckType", "category", "city"]]);
  });
  it("second truck links to the same business with the same contact and inherited links", () => {
    const first = buildSignup(input, null);
    if (!first.ok) throw new Error("first failed");
    const existing: ExistingBusiness = {
      ownerId: "owner-1", businessName: first.businessName, contact: parseContact(first.truck.description)!,
      website: "https://ruiz.com", instagram: "ruizeats", facebook: null, truckNames: ["Taco One"],
    };
    const second = buildSignup({ ...input, contactName: "A", phone: "", businessName: "Other", website: "https://evil.com", truckName: "Taco Two" }, existing);
    if (!second.ok) throw new Error("second failed");
    expect(second.linked).toBe(true);
    expect(second.truck.created_by).toBe("owner-1");
    expect(second.businessName).toBe("Ruiz Eats");
    expect(second.contact).toEqual({ name: "Ana Ruiz", email: "ana@tacos.com", phone: "563-555-0100" });
    expect(second.truck.website).toBe("https://ruiz.com");
    expect(second.truck.name).toBe("Taco Two");
  });
  it("rejects a duplicate truck name within the same business", () => {
    const existing: ExistingBusiness = { ownerId: null, businessName: "", contact: { name: "Ana", email: "ana@tacos.com", phone: "" }, website: null, instagram: null, facebook: null, truckNames: ["Taco One"] };
    expect(buildSignup({ ...input, truckName: " taco one " }, existing).ok).toBe(false);
  });
});
