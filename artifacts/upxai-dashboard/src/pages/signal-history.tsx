import { useGetSignalHistory, getGetSignalHistoryQueryKey } from "@workspace/api-client-react";
import { SignalBadge } from "@/components/ui/signal-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { History, Search } from "lucide-react";

export default function SignalHistory() {
  const { data, isLoading } = useGetSignalHistory({
    query: { queryKey: getGetSignalHistoryQueryKey(), refetchInterval: 30000 }
  });

  const history = data?.history || [];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/40 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Signal Archive</h1>
          <p className="text-muted-foreground mt-1">Full history of generated trading signals.</p>
        </div>
      </div>

      <Card className="bg-card border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> 
            Event Log
          </CardTitle>
          <CardDescription>All signals recorded by the Genesis Engine</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 gap-4 text-primary">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span className="font-mono text-xs animate-pulse">FETCHING ARCHIVE...</span>
            </div>
          ) : history.length > 0 ? (
            <div className="rounded-md border border-border/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono text-left">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground tracking-widest border-b border-border/40">
                    <tr>
                      <th className="px-6 py-4 font-medium">Timestamp</th>
                      <th className="px-6 py-4 font-medium">Pair</th>
                      <th className="px-6 py-4 font-medium">Signal</th>
                      <th className="px-6 py-4 font-medium text-right">RSI</th>
                      <th className="px-6 py-4 font-medium text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {history.map((item, i) => (
                      <tr key={i} className="hover:bg-muted/20 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground group-hover:text-foreground transition-colors">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-bold">
                          {item.symbol}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <SignalBadge signal={item.signal} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {item.rsi.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
