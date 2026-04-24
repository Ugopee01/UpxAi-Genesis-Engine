import { useState } from "react";
import { useGetSignal, useExecuteTrade, getGetSignalQueryKey } from "@workspace/api-client-react";
import { SignalBadge } from "@/components/ui/signal-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CandlestickChart, AlertTriangle, ShieldAlert, Zap, Terminal } from "lucide-react";

export default function TradeConsole() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [liveMode, setLiveMode] = useState(false);
  const { toast } = useToast();

  const { data: signalData, isLoading: isSignalLoading } = useGetSignal(
    { symbol },
    { query: { queryKey: getGetSignalQueryKey({ symbol }) } }
  );

  const executeTradeMutation = useExecuteTrade({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: "Trade Executed",
          description: `${data.executed.signal} ${data.executed.symbol} @ $${data.executed.price.toLocaleString()}`,
          className: "border-primary bg-card text-foreground font-mono",
        });
      },
      onError: (error) => {
        toast({
          title: "Execution Failed",
          description: (error as unknown as Record<string, string>)?.error || "Unknown error occurred",
          variant: "destructive",
          className: "font-mono",
        });
      }
    }
  });

  const handleExecute = () => {
    executeTradeMutation.mutate({ data: { symbol, liveMode } });
  };

  return (
    <div className="flex flex-col gap-5 md:gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Trade Console</h1>
          <p className="text-muted-foreground text-sm mt-1">Execute orders based on Engine signals.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
        <Card className="bg-card border-border/50 shadow-lg flex flex-col">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
              <Terminal className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              Execution Parameters
            </CardTitle>
            <CardDescription className="text-xs">Configure your trade setup</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] tracking-widest text-muted-foreground uppercase">Trading Pair</Label>
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="font-mono bg-black/40 border-border/50 h-11 text-base">
                  <SelectValue placeholder="Select pair" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BTCUSDT">BTC/USDT</SelectItem>
                  <SelectItem value="ETHUSDT">ETH/USDT</SelectItem>
                  <SelectItem value="SOLUSDT">SOL/USDT</SelectItem>
                  <SelectItem value="BNBUSDT">BNB/USDT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-4 rounded-md border border-border/40 bg-muted/10 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-sm font-bold text-foreground block">Live Execution Mode</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Real funds on connected exchange</p>
                </div>
                <Switch
                  checked={liveMode}
                  onCheckedChange={setLiveMode}
                  disabled
                  className="data-[state=checked]:bg-primary shrink-0"
                />
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-mono">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <p>Live mode locked — simulated trading is active.</p>
              </div>
            </div>

            {signalData && (
              <div className="p-5 rounded-md border border-primary/20 bg-primary/5 flex flex-col items-center justify-center gap-3 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50" />
                <span className="text-[10px] text-muted-foreground tracking-widest uppercase z-10">Current Target Signal</span>
                <SignalBadge signal={signalData.signal} className="text-lg z-10" />
                <span className="font-mono text-sm z-10">@ ${signalData.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t border-border/40 pt-5">
            <Button
              className="w-full h-12 text-base font-bold font-mono tracking-widest shadow-[0_0_20px_rgba(0,240,255,0.2)] hover:shadow-[0_0_30px_rgba(0,240,255,0.4)] transition-all"
              onClick={handleExecute}
              disabled={executeTradeMutation.isPending || isSignalLoading}
            >
              {executeTradeMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  EXECUTING...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  EXECUTE SIMULATED TRADE
                </div>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Card className="bg-card border-border/50 shadow-lg">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
              <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-amber-500" />
              Execution Output
            </CardTitle>
            <CardDescription className="text-xs">Recent transaction result</CardDescription>
          </CardHeader>
          <CardContent>
            {executeTradeMutation.isSuccess && executeTradeMutation.data ? (
              <div className="space-y-4 font-mono text-sm">
                <div className="p-3 border border-emerald-500/30 bg-emerald-500/10 rounded text-emerald-400 font-bold uppercase tracking-widest text-center text-xs md:text-sm">
                  Trade Successfully Executed
                </div>

                <div className="space-y-2.5 p-4 bg-black/40 rounded border border-border/40">
                  {[
                    { label: "STATUS", value: <span className="text-emerald-400">CONFIRMED</span> },
                    { label: "MODE", value: <span className="text-amber-400">SIMULATED</span> },
                    { label: "PAIR", value: <span className="font-bold">{executeTradeMutation.data.executed.symbol.replace('USDT', '/USDT')}</span> },
                    { label: "ACTION", value: <SignalBadge signal={executeTradeMutation.data.executed.signal} className="text-[10px] py-0 px-2" /> },
                    { label: "PRICE", value: `$${executeTradeMutation.data.executed.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
                    { label: "TIME", value: <span className="opacity-70">{new Date(executeTradeMutation.data.executed.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> },
                    { label: "TX", value: <span className="text-xs opacity-40">0x{Math.random().toString(16).slice(2, 10)}...sim</span> },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between items-center border-b border-border/20 pb-2 last:border-0 last:pb-0">
                      <span className="text-muted-foreground text-xs">{label}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground font-mono text-xs border border-dashed border-border/50 rounded-md bg-black/20">
                AWAITING EXECUTION COMMAND
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
