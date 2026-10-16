import { Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";

const trigger = "grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-card text-sm font-semibold shadow-pop transition-all duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AccountButton() {
  const { user, isAdmin, openAuth, signOut } = useAuth();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={user ? `${trigger} border-primary bg-primary text-primary-foreground hover:bg-primary/90` : trigger} aria-label="Account menu">
        {user ? (user.email ?? "?")[0]!.toUpperCase() : <User className="h-5 w-5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {user ? (
          <DropdownMenuLabel className="truncate">{user.email}{isAdmin && " · admin"}</DropdownMenuLabel>
        ) : (
          <DropdownMenuItem onClick={() => openAuth()} className="min-h-11 font-semibold">Sign in</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-11"><Link to="/favorites">Favorites</Link></DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-11"><Link to="/owner">Owner dashboard</Link></DropdownMenuItem>
        {isAdmin && <DropdownMenuItem asChild className="min-h-11"><Link to="/admin">Admin</Link></DropdownMenuItem>}
        {user && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => void signOut()} className="min-h-11">Sign out</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
