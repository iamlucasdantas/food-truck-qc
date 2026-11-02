// Owner tutorial series (7 short vertical videos + printable PDFs).
// Videos are unlisted on the FoodTruckQC YouTube channel; PDFs ship in /public/tutorials.
// Source files and re-recording pipeline: "Food Truck QC/Tutoriais" (outside the repo).

export type TutorialKey = "account" | "truck" | "claim" | "menu" | "photos" | "schedule" | "live";

export type Tutorial = {
  key: TutorialKey;
  n: number;
  title: string;
  blurb: string;
  length: string;
  youtubeId: string;
  pdf: string;
};

export const TUTORIALS: Tutorial[] = [
  { key: "account", n: 1, title: "Create your account and sign in", blurb: "Make a free account on your phone and sign in.", length: "2:00", youtubeId: "Uoc51CXDFaQ", pdf: "/tutorials/01-create-account.pdf" },
  { key: "truck", n: 2, title: "Put your truck on the map", blurb: "Set up your business and your truck so people can find you.", length: "3:01", youtubeId: "9JEpvDGRYLY", pdf: "/tutorials/02-add-your-truck.pdf" },
  { key: "claim", n: 3, title: "Already on the map? Claim your truck", blurb: "If your truck is listed already, claim it to manage it.", length: "1:18", youtubeId: "cj5CAB7DxeI", pdf: "/tutorials/03-claim-your-truck.pdf" },
  { key: "menu", n: 4, title: "Add your menu from a photo", blurb: "Snap your menu board, check what the app reads, publish.", length: "1:31", youtubeId: "6oDj0eNgx04", pdf: "/tutorials/04-add-your-menu.pdf" },
  { key: "photos", n: 5, title: "Add truck photos", blurb: "Photos of your truck, food and crew on your public page.", length: "0:56", youtubeId: "XrtuP0qryUw", pdf: "/tutorials/05-add-truck-photos.pdf" },
  { key: "schedule", n: 6, title: "Your schedule: where you'll be", blurb: "Add stops and a weekly schedule so customers know where to go.", length: "1:42", youtubeId: "HAgSycWrMIk", pdf: "/tutorials/06-your-schedule.pdf" },
  { key: "live", n: 7, title: "Go live with “I'm here” and edit your profile", blurb: "Light up on the map right now and keep your profile fresh.", length: "2:00", youtubeId: "1G09MUULq0o", pdf: "/tutorials/07-go-live-and-profile.pdf" },
];

export const tutorial = (key: TutorialKey): Tutorial => TUTORIALS.find((t) => t.key === key)!;

/** Privacy-enhanced embed; works inside the Android WebView (playsinline). */
export const embedUrl = (youtubeId: string, autoplay = false) =>
  `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1&playsinline=1${autoplay ? "&autoplay=1" : ""}`;

export const thumbUrl = (youtubeId: string) => `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
