import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Activity, FileText, ClipboardCheck, LayoutDashboard } from "lucide-react";

const navItems = [
  { href: "/", label: "Home", icon: null },
  { href: "/intake", label: "Start Case", icon: Activity },
  { href: "/form", label: "Live Case Summary", icon: FileText },
  { href: "/review", label: "Review", icon: ClipboardCheck },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function Header() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex h-16 items-center">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold leading-tight text-foreground">
              MedDoc
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Copilot
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link key={item.href} to={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-2",
                    isActive && "bg-secondary text-secondary-foreground"
                  )}
                >
                  {item.icon && <item.icon className="h-4 w-4" />}
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>

      </div>
    </header>
  );
}
