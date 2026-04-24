import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSignal,
  useExecuteTrade,
  useListExchanges,
  getGetSignalQueryKey,
  getListExchangesQueryKey,
  getGetSignalHistoryQueryKey,
} from "@workspace/api-client-react";
import type { ExchangeStatusExchange } from "@workspace/api-client-react";
import { SignalBadge } from "@/components/ui/signal-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ShieldAlert, ShieldCheck, Zap, Terminal, Plug } from "lucide-react";

const LIVE_MIN_USDT = 5;
const LIVE_MAX_USDT = 50;

type Side = "BUY" | "SELL";

export default function TradeConsole() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [liveMode, setLiveMode] = useState(false);
  const [side, setSide] = useState<Side>("BUY");
  const [quantityUsdt, setQuantityUsdt] = useState<string>("10");
  const [targetExchange, setTargetExchange] = useState<ExchangeStatusExchange | undefined>(undefined);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: signalData, isLoading: isSignalLoading } = useGetSignal(
    { symbol },
    { query: { queryKey: getGetSignalQueryKey({ symbol }) } }
  );

  const { data: exchangeData } = useListExchanges({
    query: { queryKey: getListExchangesQueryKey(), refetchInterval: 60000 },
  });
  const connectedExchanges = (exchangeData?.exchanges ?? []).filter((e) => e.configured);
  const hasConnectedExchange = connectedExchanges.length > 0;
  const activeExchange =
    connectedExchanges.find((e) => e.exchange === targetExchange) ?? connectedExchanges[0];

  // Keep targetExchange in sync with what's actually connected.
  useEffect(() => {
    if (!hasConnectedExchange) {
      if (targetExchange !== undefined) setTargetExchange(undefined);
      return;
    }
    if (!targetExchange || !connectedExchanges.some((e) => e.exchange === targetExchange)) {
      setTargetExchange(connectedExchanges[0].exchange);
    }
  }, [hasConnectedExchange, connectedExchanges, targetExchange]);

  // Default the side to whichever direction the engine currently signals.
  useEffect(() => {
    if (signalData?.signal === "BUY" || signalData?.signal === "SELL") {
      setSide(signalData.signal);
    }
  }, [signalData?.signal]);

  // If the user disconnects all exchanges, force live mode back off so the
  // safety toggle reflects reality.
  useEffect(() => {
    if (!hasConnectedExchange && liveMode) setLiveMode(false);
  }, [hasConnectedExchange, liveMode]);

  const executeTradeMutation = useExecuteTrade({
    mutation: {
      onSuccess: (data) => {
        const isLive = data.mode === "LIVE";
        const failed = data.status === "FAILED";
        toast({
          title: failed
            ? "Live order failed"
            : isLive
              ? `Live ${data.executed.signal} placed`
              : "Trade Executed",
          description: failed
            ? data.error || "Exchange rejected the order."
            : `${data.executed.signal} ${data.executed.symbol} @ $${data.executed.price.toLocaleString()}` +
              (isLive && data.executedQuoteQty
                ? ` (~${data.executedQuoteQty.toFixed(2)} USDT via ${data.targetExchange})`
                : ""),
          variant: failed ? "destructive" : "default",
          className: failed ? "font-mono" : "border-primary bg-card text-foreground font-mono",
        });
        queryClient.invalidateQueries({ queryKey: getGetSignalHistoryQueryKey() });
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

  const parsedQty = Number(quantityUsdt);
  const qtyValid = Number.isFinite(parsedQty) && parsedQty >= LIVE_MIN_USDT && parsedQty <= LIVE_MAX_USDT;

  const submitSimulated = () => {
    executeTradeMutation.mutate({
      data: {
        symbol,
        liveMode: false,
        side,
      },
    });
  };

  const submitLive = () => {
    setConfirmOpen(false);
    executeTradeMutation.mutate({
      data: {
        symbol,
        liveMode: true,
        confirmLive: true,
        side,
        quantityUsdt: parsedQty,
        targetExchange: activeExchange?.exchange,
      },
    });
  };

  const handleExecute = () => {
    if (liveMode) {
      if (!qtyValid) {
        toast({
          title: "Invalid order size",
          description: `Enter an amount between ${LIVE_MIN_USDT} and ${LIVE_MAX_USDT} USDT.`,
          variant: "destructive",
          className: "font-mono",
        });
        return;
      }
      setConfirmOpen(true);
    } else {
      submitSimulated();
    }
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-[10px] tracking-widest text-muted-foreground uppercase">Side</Label>
                <Select value={side} onValueChange={(v) => setSide(v as Side)}>
                  <SelectTrigger className="font-mono bg-black/40 border-border/50 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] tracking-widest text-muted-foreground uppercase">
                  Amount (USDT)
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={LIVE_MIN_USDT}
                  max={LIVE_MAX_USDT}
                  step="1"
                  value={quantityUsdt}
                  onChange={(e) => setQuantityUsdt(e.target.value)}
                  className="font-mono bg-black/40 border-border/50 h-11 text-base"
                  data-testid="input-quantity-usdt"
                />
              </div>
            </div>
            {liveMode && !qtyValid && (
              <p className="text-[11px] font-mono text-rose-400 -mt-2">
                Live order amount must be between {LIVE_MIN_USDT} and {LIVE_MAX_USDT} USDT.
              </p>
            )}

            {connectedExchanges.length > 1 && (
              <div className="space-y-2">
                <Label className="text-[10px] tracking-widest text-muted-foreground uppercase">
                  Route via
                </Label>
                <Select
                  value={activeExchange?.exchange}
                  onValueChange={(v) => setTargetExchange(v as ExchangeStatusExchange)}
                >
                  <SelectTrigger className="font-mono bg-black/40 border-border/50 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {connectedExchanges.map((e) => (
                      <SelectItem key={e.exchange} value={e.exchange}>
                        {e.name} {e.lastTestStatus === "ok" ? "✓" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="p-4 rounded-md border border-border/40 bg-muted/10 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-sm font-bold text-foreground block">Live Execution Mode</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {hasConnectedExchange
                      ? `Routes orders through ${activeExchange?.name}`
                      : "Real funds on connected exchange"}
                  </p>
                </div>
                <Switch
                  checked={liveMode}
                  onCheckedChange={setLiveMode}
                  disabled={!hasConnectedExchange}
                  className="data-[state=checked]:bg-primary shrink-0"
                  data-testid="switch-live-mode"
                />
              </div>
              {!hasConnectedExchange ? (
                <div className="flex items-start gap-2.5 p-3 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-mono">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p>Live mode locked — no exchange connected.</p>
                    <Link href="/exchanges" className="inline-flex items-center gap-1 mt-1.5 text-amber-300 hover:text-amber-200 underline-offset-2 hover:underline">
                      <Plug className="h-3 w-3" /> Connect an exchange →
                    </Link>
                  </div>
                </div>
              ) : liveMode ? (
                <div className="flex items-start gap-2.5 p-3 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    Live mode armed — pressing Execute will place a real {side} of about{" "}
                    {qtyValid ? `${parsedQty.toFixed(2)} USDT` : "??? USDT"} on {activeExchange?.name}.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>{activeExchange?.name} connected. Toggle on to arm live execution.</p>
                </div>
              )}
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
              data-testid="button-execute"
            >
              {executeTradeMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  EXECUTING...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  {liveMode ? `EXECUTE LIVE ${side} VIA ${activeExchange?.name?.toUpperCase()}` : "EXECUTE SIMULATED TRADE"}
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
              (() => {
                const d = executeTradeMutation.data;
                const isLive = d.mode === "LIVE";
                const failed = d.status === "FAILED";
                return (
                  <div className="space-y-4 font-mono text-sm">
                    <div
                      className={
                        failed
                          ? "p-3 border border-rose-500/30 bg-rose-500/10 rounded text-rose-400 font-bold uppercase tracking-widest text-center text-xs md:text-sm"
                          : "p-3 border border-emerald-500/30 bg-emerald-500/10 rounded text-emerald-400 font-bold uppercase tracking-widest text-center text-xs md:text-sm"
                      }
                    >
                      {failed
                        ? "Live Order Failed"
                        : isLive
                          ? "Live Order Placed"
                          : "Trade Successfully Executed"}
                    </div>

                    <div className="space-y-2.5 p-4 bg-black/40 rounded border border-border/40">
                      {[
                        {
                          label: "STATUS",
                          value: failed ? (
                            <span className="text-rose-400">{d.status}</span>
                          ) : d.status === "ACCEPTED" ? (
                            <span className="text-amber-400">{d.status}</span>
                          ) : (
                            <span className="text-emerald-400">{d.status}</span>
                          ),
                        },
                        {
                          label: "MODE",
                          value: isLive ? (
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold tracking-widest">
                              LIVE
                            </span>
                          ) : (
                            <span className="text-amber-400">SIMULATED</span>
                          ),
                        },
                        ...(isLive && d.targetExchange
                          ? [{ label: "EXCHANGE", value: <span className="uppercase">{d.targetExchange}</span> }]
                          : []),
                        { label: "PAIR", value: <span className="font-bold">{d.executed.symbol.replace("USDT", "/USDT")}</span> },
                        { label: "ACTION", value: <SignalBadge signal={d.executed.signal} className="text-[10px] py-0 px-2" /> },
                        { label: "PRICE", value: `$${d.executed.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
                        ...(d.executedQuoteQty
                          ? [{ label: "NOTIONAL", value: `${d.executedQuoteQty.toFixed(2)} USDT` }]
                          : []),
                        {
                          label: "TIME",
                          value: <span className="opacity-70">{new Date(d.executed.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>,
                        },
                        {
                          label: isLive ? "ORDER" : "TX",
                          value: isLive ? (
                            <span className="text-xs opacity-70">{d.orderId || "—"}</span>
                          ) : (
                            <span className="text-xs opacity-40">0x{Math.random().toString(16).slice(2, 10)}...sim</span>
                          ),
                        },
                        ...(failed && d.error
                          ? [{ label: "ERROR", value: <span className="text-rose-400 text-xs">{d.error}</span> }]
                          : []),
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center border-b border-border/20 pb-2 last:border-0 last:pb-0 gap-3">
                          <span className="text-muted-foreground text-xs">{label}</span>
                          <span className="text-right">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground font-mono text-xs border border-dashed border-border/50 rounded-md bg-black/20">
                AWAITING EXECUTION COMMAND
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="font-mono">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-400" />
              Confirm live order
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                <p className="text-sm">
                  This will place a <span className="font-bold text-foreground">real spot order</span>{" "}
                  on {activeExchange?.name} using your connected API key.
                </p>
                <div className="text-xs bg-black/40 border border-border/40 rounded p-3 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">PAIR</span><span className="font-bold">{symbol.replace("USDT", "/USDT")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">SIDE</span><span className="font-bold">{side}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">AMOUNT</span><span className="font-bold">{qtyValid ? parsedQty.toFixed(2) : "—"} USDT</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">EXCHANGE</span><span className="font-bold uppercase">{activeExchange?.exchange}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">TYPE</span><span className="font-bold">MARKET</span></div>
                </div>
                <p className="text-xs text-rose-300">
                  Funds will be moved immediately and cannot be undone from this app.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-live">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={submitLive}
              className="bg-rose-500 hover:bg-rose-500/90 text-white"
              data-testid="button-confirm-live"
            >
              Place live {side}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
