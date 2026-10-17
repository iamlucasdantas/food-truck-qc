import { describe, expect, it } from "vitest";
import { cleanAgentParams, isBlankParam } from "./agent-params";

describe("cleanAgentParams", () => {
  it("drops empty, null-ish and placeholder values", () => {
    expect(cleanAgentParams({ location: "", when: "null", cuisine: "undefined", dish: "None", query: "{{contact.query}}", radius_miles: "" })).toEqual({});
    expect(isBlankParam("{{custom_values.ftqc_chat_api_key}}")).toBe(true);
  });
  it("accepts open_now variants", () => {
    for (const v of ["true", "True", "TRUE", "yes", "1"]) expect(cleanAgentParams({ open_now: v }).open_now).toBe("true");
    expect(cleanAgentParams({ open_now: true }).open_now).toBe("true");
  });
  it("parses numbers with spaces or decimals", () => {
    expect(cleanAgentParams({ radius_miles: " 7.5 ", days: " 3.0" })).toEqual({ radius_miles: "7.5", days: "3" });
  });
  it("ignores unknown params", () => {
    expect(cleanAgentParams({ call_id: "x", contact_id: "y", location: "Moline" })).toEqual({ location: "Moline" });
  });
});
