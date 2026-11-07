// Usage: node check.mjs columns.json   (columns.json = the JSON cell from query 1 of verify.sql)
import { readFileSync } from "node:fs";
const expected = JSON.parse(readFileSync(new URL("./expected-columns.json", import.meta.url), "utf8"));
const actual = JSON.parse(readFileSync(process.argv[2], "utf8"));
const family = (dt, udt) => {
  if (dt === "ARRAY") return "array";
  if (dt === "jsonb" || dt === "json") return "json";
  if (dt === "boolean") return "boolean";
  if (["double precision", "integer", "bigint", "numeric", "real", "smallint"].includes(dt)) return "number";
  if (["text", "uuid", "character varying", "date", "timestamp with time zone", "timestamp without time zone", "time without time zone", "USER-DEFINED"].includes(dt)) return "string";
  return "unknown:" + dt + "/" + udt;
};
const diffs = [];
for (const [t, cols] of Object.entries(expected)) {
  if (!actual[t]) { diffs.push("missing table " + t); continue; }
  for (const [c, e] of Object.entries(cols)) {
    const a = actual[t][c];
    if (!a) { diffs.push(t + "." + c + ": missing"); continue; }
    const f = family(a.data_type, a.udt);
    if (f !== e.family) diffs.push(t + "." + c + ": type family " + f + " (expected " + e.family + ")");
    if (a.nullable !== e.nullable) diffs.push(t + "." + c + ": nullable=" + a.nullable + " (expected " + e.nullable + ")");
  }
  for (const c of Object.keys(actual[t])) if (!cols[c]) diffs.push(t + "." + c + ": extra column not in types.ts");
}
for (const t of Object.keys(actual)) if (!expected[t]) diffs.push("extra table " + t);
console.log(diffs.length ? diffs.join("\n") : "OK: all " + Object.keys(expected).length + " tables match types.ts");
process.exit(diffs.length ? 1 : 0);
