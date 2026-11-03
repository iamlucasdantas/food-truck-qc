// Owner tutorial series: 7 "basics" videos + 3 optional "run your truck by talking to your AI" videos,
// all short vertical videos with printable PDFs.
// Videos are unlisted on the FoodTruckQC YouTube channel; PDFs ship in /public/tutorials.
// Source files and re-recording pipeline: "Food Truck QC/Tutoriais" (outside the repo).

export type TutorialKey = "account" | "truck" | "claim" | "menu" | "photos" | "schedule" | "live" | "ai-connect" | "ai-register" | "ai-live";
export type TutorialGroup = "basics" | "ai";

export type Tutorial = {
  key: TutorialKey;
  group: TutorialGroup;
  n: number;
  title: string;
  blurb: string;
  length: string;
  youtubeId: string;
  pdf: string;
};

export const TUTORIALS: Tutorial[] = [
  { key: "account", group: "basics", n: 1, title: "Create your account and sign in", blurb: "Make a free account on your phone and sign in.", length: "2:00", youtubeId: "Uoc51CXDFaQ", pdf: "/tutorials/01-create-account.pdf" },
  { key: "truck", group: "basics", n: 2, title: "Put your truck on the map", blurb: "Set up your business and your truck so people can find you.", length: "3:01", youtubeId: "9JEpvDGRYLY", pdf: "/tutorials/02-add-your-truck.pdf" },
  { key: "claim", group: "basics", n: 3, title: "Already on the map? Claim your truck", blurb: "If your truck is listed already, claim it to manage it.", length: "1:18", youtubeId: "cj5CAB7DxeI", pdf: "/tutorials/03-claim-your-truck.pdf" },
  { key: "menu", group: "basics", n: 4, title: "Add your menu from a photo", blurb: "Snap your menu board, check what the app reads, publish.", length: "1:31", youtubeId: "6oDj0eNgx04", pdf: "/tutorials/04-add-your-menu.pdf" },
  { key: "photos", group: "basics", n: 5, title: "Add truck photos", blurb: "Photos of your truck, food and crew on your public page.", length: "0:56", youtubeId: "XrtuP0qryUw", pdf: "/tutorials/05-add-truck-photos.pdf" },
  { key: "schedule", group: "basics", n: 6, title: "Your schedule: where you'll be", blurb: "Add stops and a weekly schedule so customers know where to go.", length: "1:42", youtubeId: "HAgSycWrMIk", pdf: "/tutorials/06-your-schedule.pdf" },
  { key: "live", group: "basics", n: 7, title: "Go live with “I'm here” and edit your profile", blurb: "Light up on the map right now and keep your profile fresh.", length: "2:00", youtubeId: "1G09MUULq0o", pdf: "/tutorials/07-go-live-and-profile.pdf" },
  // Optional: connect Claude/ChatGPT with an API key and run the truck by voice (owner MCP tools).
  { key: "ai-connect", group: "ai", n: 8, title: "Connect your AI to FoodTruckQC", blurb: "Create an API key and connect Claude or ChatGPT once.", length: "1:49", youtubeId: "zO5WVWbwnOY", pdf: "/tutorials/08-connect-your-ai.pdf" },
  { key: "ai-register", group: "ai", n: 9, title: "Put your truck on the map by voice", blurb: "Tell your AI about your truck; it fills in the form and submits it for review.", length: "1:01", youtubeId: "qZaPVYfKt6M", pdf: "/tutorials/09-register-by-voice.pdf" },
  { key: "ai-live", group: "ai", n: 10, title: "“I'm here” and stops by voice", blurb: "Go live, add this week's stops and check out just by saying it.", length: "1:05", youtubeId: "0-8LhrSw9OQ", pdf: "/tutorials/10-voice-check-in.pdf" },
];

export const tutorial = (key: TutorialKey): Tutorial => TUTORIALS.find((t) => t.key === key)!;
export const tutorialsIn = (group: TutorialGroup): Tutorial[] => TUTORIALS.filter((t) => t.group === group);

/** Privacy-enhanced embed; works inside the Android WebView (playsinline). */
export const embedUrl = (youtubeId: string, autoplay = false) =>
  `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1&playsinline=1${autoplay ? "&autoplay=1" : ""}`;

export const thumbUrl = (youtubeId: string) => `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
