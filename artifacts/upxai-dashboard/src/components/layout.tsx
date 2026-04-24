import { Link, useLocation } from "wouter";
import { Activity, History, CandlestickChart } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: Activity },
    { href: "/trade", label: "Trade Console", icon: CandlestickChart },
    { href: "/signals", label: "Signal History", icon: History },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans dark selection:bg-primary/30 selection:text-primary">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 max-w-screen-2xl items-center px-4 md:px-8">
          <div className="flex items-center gap-3 mr-8">
            <img src="/logo.png" alt="UPXAI Logo" className="h-8 w-8 rounded-full border border-primary/50 shadow-[0_0_10px_rgba(0,240,255,0.3)] animate-pulse-fast" />
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight leading-none text-primary">UPXAI</span>
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest leading-none mt-1">Genesis Engine</span>
            </div>
          </div>
          
          <nav className="flex items-center space-x-1 lg:space-x-2 text-sm font-medium">
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
                  <span className="hidden sm:inline-block">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center space-x-4">
            <div className="hidden md:flex items-center gap-2 text-xs font-mono border border-border/50 bg-muted/30 px-3 py-1.5 rounded-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-muted-foreground">ENGINE STATUS: <span className="text-green-400">ONLINE</span></span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex-col flex w-full max-w-screen-2xl mx-auto p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
