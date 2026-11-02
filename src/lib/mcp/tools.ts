import searchTrucks from "./tools/search-trucks";
import upcomingStops from "./tools/upcoming-stops";
import myFavorites from "./tools/my-favorites";
import setFavorite from "./tools/set-favorite";
import { myTruck, registerMyTruck, updateMyTruck } from "./tools/owner-trucks";
import { addMyStop, checkIn, checkOut } from "./tools/owner-stops";
import { adminListBusinesses, adminSaveBusiness, adminDeleteBusiness } from "./tools/admin-businesses";
import { adminGetTruck, adminSaveTruck, adminDeleteTruck } from "./tools/admin-trucks";
import { adminListStops, adminSaveStop, adminDeleteStop } from "./tools/admin-stops";

/** Shared by the OAuth endpoint (/mcp) and the API-key endpoint (/api/public/mcp-key). */
export const mcpTools = [
  searchTrucks, upcomingStops, myFavorites, setFavorite,
  myTruck, registerMyTruck, updateMyTruck, addMyStop, checkIn, checkOut,
  adminListBusinesses, adminSaveBusiness, adminDeleteBusiness, adminGetTruck, adminSaveTruck, adminDeleteTruck, adminListStops, adminSaveStop, adminDeleteStop,
];

export const mcpInstructions = [
  "Find Quad Cities food trucks: search trucks by name/cuisine/dish, see upcoming stops (Central time), and manage the signed-in user's favorites.",
  "Food truck owners (signed in with OAuth or their personal API key) manage their own truck: my_truck shows it, register_my_truck puts a new truck on the map (pending approval), update_my_truck edits details, add_my_stop schedules dated or weekly stops, check_in / check_out are the “I'm here” button. Owners can only touch trucks they claimed or created; ask them for missing details instead of guessing. Times are Central (America/Chicago).",
  "Admin accounts can also manage the hierarchy business → trucks → stops (create, edit, delete); other callers get 'Admins only'.",
].join(" ");
