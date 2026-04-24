import { Badge } from "@/components/ui/badge";

type SignalType = "BUY" | "SELL" | "HOLD";

export function SignalBadge({ signal, className = "" }: { signal: SignalType; className?: string }) {
  const getStyles = () => {
    switch (signal) {
      case "BUY":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]";
      case "SELL":
        return "bg-rose-500/10 text-rose-400 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]";
      case "HOLD":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Badge variant="outline" className={`font-mono font-bold tracking-widest px-3 py-1 ${getStyles()} ${className}`}>
      {signal}
    </Badge>
  );
}
