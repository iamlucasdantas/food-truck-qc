import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="flex justify-center gap-4 py-4 text-xs text-muted-foreground">
      <Link to="/privacy" className="hover:underline">Privacy</Link>
      <Link to="/terms" className="hover:underline">Terms</Link>
      <span>© FoodTruckQC</span>
    </footer>
  );
}
