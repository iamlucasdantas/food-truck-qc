import { auth, defineMcp } from "@lovable.dev/mcp-js";
import { mcpInstructions, mcpTools } from "./tools";

// Vite inlines the stable ref; the runtime SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "food-truck-qc",
  title: "Food Truck QC",
  version: "0.1.0",
  instructions: mcpInstructions,
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: mcpTools,
});
