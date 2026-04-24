import { useGetSignalHistory, getGetSignalHistoryQueryKey } from "@workspace/api-client-react";
import type { SignalHistoryItem } from "@workspace/api-client-react";
import { SignalBadge } from "@/components/ui/signal-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { History, Search } from "lucide-react";

function ModeBadge({ item }: { item: SignalHistoryItem }) {
  if (item.mode !== "LIVE") return null;
  const failed = item.status === "FAILED";
  const accepted = item.status === "ACCEPTED";
  let label = "LIVE";
  let className =
    "ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest bg-rose-500/20 border border-rose-500/50 text-rose-200";
  let title = `Routed via ${item.targetExchange ?? "exchange"}`;
  if (failed) {
    label = "LIVE · FAIL";
    className =
      "ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest bg-rose-500/15 border border-rose-500/40 text-rose-300";
    title = item.error || "Live order failed";
  } else if (accepted) {
    label = "LIVE · PEND";
    className =
      "ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest bg-amber-500/15 border border-amber-500/40 text-amber-200";
    title = `Accepted by ${item.targetExchange ?? "exchange"} — fill pending`;
  }
  return (
    <span title={title} className={className} data-testid="badge-live">
      {label}
    </span>
  );
}

export default function SignalHistory() {
  const { data, isLoading } = useGetSignalHistory({
    query: { queryKey: getGetSignalHistoryQueryKey(), refetchInterval: 30000 }
  });

  const history = data?.history || [];

  return (
    <div className="flex flex-col gap-5 md:gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Signal Archive</h1>
          <p className="text-muted-foreground text-sm mt-1">Full history of generated trading signals.</p>
        </div>
      </div>

      <Card className="bg-card border-border/50 shadow-lg">
        <CardHeader className="py-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-4 w-4 text-primary" />
            Event Log
          </CardTitle>
          <CardDescription className="text-xs">All signals recorded by the Genesis Engine</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 gap-4 text-primary">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span className="font-mono text-xs animate-pulse">FETCHING ARCHIVE...</span>
            </div>
          ) : history.length > 0 ? (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block rounded-md border border-border/40 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-mono text-left">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground tracking-widest border-b border-border/40">
                      <tr>
                        <th className="px-5 py-3 font-medium">Timestamp</th>
                        <th className="px-5 py-3 font-medium">Pair</th>
                        <th className="px-5 py-3 font-medium">Signal</th>
                        <th className="px-5 py-3 font-medium text-right">RSI</th>
                        <th className="px-5 py-3 font-medium text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {history.map((item, i) => (
                        <tr key={i} className="hover:bg-muted/20 transition-colors group">
                          <td className="px-5 py-3 whitespace-nowrap text-muted-foreground group-hover:text-foreground transition-colors text-xs">
                            {new Date(item.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap font-bold">{item.symbol.replace('USDT', '/USDT')}</td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <SignalBadge signal={item.signal} />
                            <ModeBadge item={item} />
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-right">{item.rsi.toFixed(2)}</td>
                          <td className="px-5 py-3 whitespace-nowrap text-right">
                            ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {history.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3.5 rounded-md border border-border/30 bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center">
                        <SignalBadge signal={item.signal} />
                        <ModeBadge item={item} />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-sm">{item.symbol.replace('USDT', '/USDT')}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(item.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-sm font-semibold">${item.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">RSI {item.rsi.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center p-12 text-muted-foreground font-mono text-sm border border-dashed border-border/50 rounded-md flex flex-col items-center gap-4">
              <Search className="h-8 w-8 opacity-20" />
              NO SIGNALS IN ARCHIVE
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
