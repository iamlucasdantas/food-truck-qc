import { describe, expect, it } from "vitest";
import { buildSignup, ownerFormSteps, parseContact, type SignupInput } from "./business";
import { completeStep, defaultTruckName, readProgress, resumeStep, showSetupCard, skipStep, truckByline, FINISH_STEP } from "./onboarding";

const input: SignupInput = {
  contactName: "Ana Ruiz", email: "ana@tacos.com", phone: "", businessName: "Ruiz Eats", description: "",
  website: "", instagram: "", facebook: "", truckName: "Taco One", truckType: "mobile", category: "Tacos", city: "Davenport",
};

describe("business name on every truck", () => {
  it("first truck gets the business name automatically", () => {
    const s = buildSignup(input, null);
    expect(s.ok && s.truck.business_name).toBe("Ruiz Eats");
  });
  it("an additional truck gets the existing business name, not a typed one", () => {
    const first = buildSignup(input, null);
    if (!first.ok) throw new Error();
    const s = buildSignup({ ...input, businessName: "Typed Other", truckName: "Taco Two" },
      { ownerId: "o1", businessName: "Ruiz Eats", contact: parseContact(first.truck.description)!, website: null, instagram: null, facebook: null, truckNames: ["Taco One"] });
    expect(s.ok && s.truck.business_name).toBe("Ruiz Eats");
  });
  it("second truck does not ask business info", () => {
    expect(ownerFormSteps(true).flat()).not.toContain("businessName");
  });
  it("first truck name is prefilled with the business name, later ones are not", () => {
    expect(defaultTruckName("Ruiz Eats", [])).toBe("Ruiz Eats");
    expect(defaultTruckName("Ruiz Eats", ["Ruiz Eats"])).toBe("");
  });
  it("shows 'by business' only when it differs from the truck name", () => {
    expect(truckByline("Taco Two", "Ruiz Eats")).toBe("by Ruiz Eats");
    expect(truckByline("Ruiz Eats", "ruiz eats")).toBe("");
    expect(truckByline("Taco Two", "")).toBe("");
  });
});

describe("onboarding wizard", () => {
  it("resumes at the saved step", () => {
    let p = readProgress({});
    p = completeStep(p, "business");
    p = completeStep(p, "truck");
    const saved = JSON.parse(JSON.stringify(p));
    expect(resumeStep(readProgress(saved))).toBe(2);
  });
  it("never resumes past a required step that isn't done", () => {
    expect(resumeStep(readProgress({ step: 4, done: ["business"] }))).toBe(1);
  });
  it("skipping optional steps moves forward and reaches the finish", () => {
    let p = completeStep(completeStep(readProgress({}), "business"), "truck");
    p = skipStep(p, "menu"); p = skipStep(p, "photos"); p = skipStep(p, "schedule");
    expect(p.step).toBe(FINISH_STEP);
    expect(p.skipped).toEqual(["menu", "photos", "schedule"]);
    expect(showSetupCard(p)).toBe(true);
  });
  it("required steps cannot be skipped", () => {
    const p = readProgress({});
    expect(skipStep(p, "business")).toEqual(p);
    expect(skipStep(p, "truck")).toEqual(p);
  });
  it("setup card hides when everything is done or dismissed", () => {
    let p = readProgress({});
    for (const k of ["business", "truck", "menu", "photos", "schedule"] as const) p = completeStep(p, k);
    expect(showSetupCard(p)).toBe(false);
    expect(showSetupCard({ ...readProgress({}), dismissed: true })).toBe(false);
  });
});
