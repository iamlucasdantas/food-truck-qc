import { Link } from "@tanstack/react-router";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";

export function AccountButton() {
  const { user, isAdmin, openAuth, signOut } = useAuth();
  if (!user) return <button onClick={() => openAuth()} className="chip shrink-0">Sign in</button>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="chip shrink-0" aria-label="Account">
        {(user.email ?? "?")[0]!.toUpperCase()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="truncate">{user.email}{isAdmin && " · admin"}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link to="/favorites">♥ My favorites</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/owner">🚚 Owner dashboard</Link></DropdownMenuItem>
        {isAdmin && <DropdownMenuItem asChild><Link to="/admin">🛠 Admin</Link></DropdownMenuItem>}
        <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
