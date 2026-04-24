import { Link, useLocation } from "wouter";
import { Activity, History, CandlestickChart, Plug, LogOut, User } from "lucide-react";
import { useListExchanges, getListExchangesQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();

  const { data: exchangeData } = useListExchanges({
    query: { queryKey: getListExchangesQueryKey(), refetchInterval: 60000 },
  });
  const connectedExchange = exchangeData?.exchanges?.find((e) => e.configured);
  const connectedCount = exchangeData?.connectedCount ?? 0;

  const navItems = [
    { href: "/", label: "Dashboard", icon: Activity },
    { href: "/trade", label: "Trade", icon: CandlestickChart },
    { href: "/signals", label: "Signals", icon: History },
    { href: "/exchanges", label: "Exchanges", icon: Plug },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans dark selection:bg-primary/30 selection:text-primary">
      {/* Top Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 md:h-16 max-w-screen-2xl items-center px-4 md:px-8">
          <div className="flex items-center gap-2.5 mr-6">
            <img src="/logo.png" alt="UPXAI Logo" className="h-7 w-7 md:h-8 md:w-8 rounded-full border border-primary/50 shadow-[0_0_10px_rgba(0,240,255,0.3)] animate-pulse-fast" />
            <div className="flex flex-col">
              <span className="font-bold text-base md:text-lg tracking-tight leading-none text-primary">UPXAI</span>
              <span className="text-[9px] md:text-[10px] font-mono text-muted-foreground uppercase tracking-widest leading-none mt-0.5">Genesis Engine</span>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2 text-sm font-medium">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-200 ${
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20 shadow-[inset_0_0_10px_rgba(0,240,255,0.1)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center space-x-2">
            {/* Connected exchange badge */}
            <Link
              href="/exchanges"
              className={`hidden md:flex items-center gap-1.5 text-xs font-mono border px-2.5 py-1 rounded-md transition-colors ${
                connectedCount > 0
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : "border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}
              title={connectedCount > 0 ? `Connected: ${connectedExchange?.name}` : "No exchange connected"}
            >
              <Plug className="h-3 w-3" />
              <span className="hidden lg:inline">{connectedCount > 0 ? `LINKED: ${connectedExchange?.name?.toUpperCase()}` : "NO EXCHANGE"}</span>
              <span className="lg:hidden">{connectedCount > 0 ? connectedExchange?.name?.toUpperCase() : "NONE"}</span>
            </Link>
            <div className="flex items-center gap-1.5 text-xs font-mono border border-border/50 bg-muted/30 px-2.5 py-1 rounded-md">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
              </span>
              <span className="text-muted-foreground hidden sm:inline">ENGINE: <span className="text-green-400">ONLINE</span></span>
              <span className="text-green-400 sm:hidden">LIVE</span>
            </div>
            {user && (
              <div className="hidden md:flex items-center gap-1.5 text-xs font-mono border border-border/50 bg-muted/30 px-2.5 py-1 rounded-md text-muted-foreground">
                <User className="h-3 w-3" />
                <span data-testid="header-username" className="text-foreground">{user.username}</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void signOut()}
              data-testid="sign-out-button"
              className="h-8 px-2.5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5 md:mr-1.5" />
              <span className="hidden md:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content — padded bottom on mobile for the bottom nav */}
      <main className="flex-1 flex-col flex w-full max-w-screen-2xl mx-auto p-4 md:p-8 pb-24 md:pb-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg transition-all duration-200 flex-1 ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 transition-all ${isActive ? "drop-shadow-[0_0_6px_rgba(0,240,255,0.8)]" : ""}`} />
                <span className="text-[10px] font-mono uppercase tracking-wider">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
