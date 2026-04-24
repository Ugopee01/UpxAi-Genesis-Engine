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
          description: `Successfully executed ${data.executed.signal} for ${data.executed.symbol} at $${data.executed.price.toLocaleString()}`,
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
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/40 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trade Console</h1>
          <p className="text-muted-foreground mt-1">Execute orders based on Engine signals.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border/50 shadow-lg flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Terminal className="h-5 w-5 text-primary" /> 
              Execution Parameters
            </CardTitle>
            <CardDescription>Configure your trade setup</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            <div className="space-y-2">
              <Label className="text-xs tracking-widest text-muted-foreground uppercase">Trading Pair</Label>
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="font-mono bg-black/40 border-border/50 h-12 text-lg">
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

            <div className="p-4 rounded-md border border-border/40 bg-muted/10 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-bold text-foreground">Live Execution Mode</Label>
                  <p className="text-sm text-muted-foreground">Trade with real funds on connected exchange</p>
                </div>
                <Switch 
                  checked={liveMode} 
                  onCheckedChange={setLiveMode}
                  disabled // Locked as per requirements
                  className="data-[state=checked]:bg-primary"
                />
              </div>
              <div className="flex items-start gap-3 p-3 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm font-mono">
                <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                <p>Live mode is currently locked. "Coming soon" - simulated trading is active.</p>
              </div>
            </div>

            {signalData && (
              <div className="p-6 rounded-md border border-primary/20 bg-primary/5 flex flex-col items-center justify-center gap-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50" />
                <span className="text-xs text-muted-foreground tracking-widest uppercase z-10">Current Target Signal</span>
                <SignalBadge signal={signalData.signal} className="text-xl z-10" />
                <span className="font-mono text-sm z-10">@ ${signalData.price.toLocaleString()}</span>
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t border-border/40 pt-6">
            <Button 
              className="w-full h-14 text-lg font-bold font-mono tracking-widest shadow-[0_0_20px_rgba(0,240,255,0.2)] hover:shadow-[0_0_30px_rgba(0,240,255,0.4)] transition-all"
              onClick={handleExecute}
              disabled={executeTradeMutation.isPending || isSignalLoading}
            >
              {executeTradeMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  EXECUTING...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  EXECUTE SIMULATED TRADE
                </div>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Card className="bg-card border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> 
              Execution Output
            </CardTitle>
            <CardDescription>Recent transaction result</CardDescription>
          </CardHeader>
          <CardContent>
            {executeTradeMutation.isSuccess && executeTradeMutation.data ? (
              <div className="space-y-6 font-mono text-sm">
                <div className="p-4 border border-emerald-500/30 bg-emerald-500/10 rounded text-emerald-400 font-bold uppercase tracking-widest text-center">
                  Trade Successfully Executed
                </div>
                
                <div className="space-y-3 p-6 bg-black/40 rounded border border-border/40">
                  <div className="flex justify-between border-b border-border/30 pb-2">
                    <span className="text-muted-foreground">STATUS</span>
                    <span className="text-emerald-400">CONFIRMED</span>
                  </div>
                  <div className="flex justify-between border-b border-border/30 pb-2">
                    <span className="text-muted-foreground">MODE</span>
                    <span className="text-amber-400">SIMULATED</span>
                  </div>
                  <div className="flex justify-between border-b border-border/30 pb-2">
                    <span className="text-muted-foreground">PAIR</span>
                    <span className="font-bold">{executeTradeMutation.data.executed.symbol}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/30 pb-2">
                    <span className="text-muted-foreground">ACTION</span>
                    <span><SignalBadge signal={executeTradeMutation.data.executed.signal} className="text-[10px] py-0 px-2" /></span>
                  </div>
                  <div className="flex justify-between border-b border-border/30 pb-2">
                    <span className="text-muted-foreground">PRICE</span>
                    <span>${executeTradeMutation.data.executed.price.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/30 pb-2">
                    <span className="text-muted-foreground">TIME</span>
                    <span className="opacity-70">{new Date(executeTradeMutation.data.executed.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex justify-between pt-2">
                    <span className="text-muted-foreground">TX_HASH</span>
                    <span className="text-xs opacity-50 break-all w-1/2 text-right">0x{Math.random().toString(16).slice(2, 10)}...sim</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground font-mono text-sm border border-dashed border-border/50 rounded-md bg-black/20">
                AWAITING EXECUTION COMMAND
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
