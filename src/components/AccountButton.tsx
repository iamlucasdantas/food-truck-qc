import { Link } from "@tanstack/react-router";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useFavorites } from "@/hooks/use-favorites";
import { useProfile, initials } from "@/hooks/use-profile";

const ring = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AccountButton() {
  const { user, roles, isAdmin, openAuth, signOut } = useAuth();
  const { ids } = useFavorites();
  const { data: profile } = useProfile();
  if (!user) {
    return (
      <button onClick={() => openAuth()} className={`h-11 shrink-0 rounded-full border border-border bg-card px-4 text-sm font-medium shadow-pop transition-colors duration-150 hover:bg-muted ${ring}`}>
        Sign in
      </button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Account menu" className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-pop transition-colors duration-150 hover:bg-primary/90 ${ring}`}>
        {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(profile?.display_name, user.email)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[1200] w-60">
        <DropdownMenuLabel className="truncate">
          <span className="block truncate">{profile?.display_name || "Your account"}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-11">
          <Link to="/favorites" className="flex justify-between">Favorites
            {ids.length > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{ids.length}</span>}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-11"><Link to="/profile" search={{section:"home",view:undefined}}>Profile & settings</Link></DropdownMenuItem>
        {(roles.includes("owner") || isAdmin) && <DropdownMenuItem asChild className="min-h-11"><Link to="/owner">Owner dashboard</Link></DropdownMenuItem>}
        {isAdmin && <DropdownMenuItem asChild className="min-h-11"><Link to="/admin">Admin</Link></DropdownMenuItem>}
        <DropdownMenuItem asChild className="min-h-11"><a href="https://foodtruckqc.com" target="_blank" rel="noopener noreferrer">About FoodTruckQC</a></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()} className="min-h-11">Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
