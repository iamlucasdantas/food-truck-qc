import searchTrucks from "./tools/search-trucks";
import upcomingStops from "./tools/upcoming-stops";
import myFavorites from "./tools/my-favorites";
import setFavorite from "./tools/set-favorite";
import { adminListBusinesses, adminSaveBusiness, adminDeleteBusiness } from "./tools/admin-businesses";
import { adminGetTruck, adminSaveTruck, adminDeleteTruck } from "./tools/admin-trucks";
import { adminListStops, adminSaveStop, adminDeleteStop } from "./tools/admin-stops";

/** Shared by the OAuth endpoint (/mcp) and the API-key endpoint (/api/public/mcp-key). */
export const mcpTools = [searchTrucks, upcomingStops, myFavorites, setFavorite, adminListBusinesses, adminSaveBusiness, adminDeleteBusiness, adminGetTruck, adminSaveTruck, adminDeleteTruck, adminListStops, adminSaveStop, adminDeleteStop];

export const mcpInstructions = "Find Quad Cities food trucks: search trucks by name/cuisine/dish, see upcoming stops (Central time), and manage the signed-in user's favorites. Admin accounts can also manage the hierarchy business → trucks → stops (create, edit, delete); other callers get 'Admins only'.";
