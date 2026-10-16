import { Logo } from "@/components/Logo";
import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-4 py-4 text-xs text-muted-foreground">
      <Logo size="sm" />
      <Link to="/privacy" className="hover:underline">Privacy</Link>
      <Link to="/terms" className="hover:underline">Terms</Link>
      <a href="https://foodtruckqc.com" target="_blank" rel="noopener noreferrer" className="hover:underline">About FoodTruckQC</a>
      <span>© FoodTruckQC</span>
    </footer>
  );
}
