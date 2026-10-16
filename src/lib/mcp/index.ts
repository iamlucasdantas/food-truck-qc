import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchTrucks from "./tools/search-trucks";
import upcomingStops from "./tools/upcoming-stops";
import myFavorites from "./tools/my-favorites";
import setFavorite from "./tools/set-favorite";

// Vite inlines the stable ref; the runtime SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "food-truck-qc",
  title: "Food Truck QC",
  version: "0.1.0",
  instructions: "Find Quad Cities food trucks: search trucks by name/cuisine/dish, see upcoming stops (Central time), and manage the signed-in user's favorites.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchTrucks, upcomingStops, myFavorites, setFavorite],
});
