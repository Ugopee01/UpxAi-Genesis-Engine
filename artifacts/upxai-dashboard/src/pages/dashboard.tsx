import { useState } from "react";
import { Link } from "wouter";
import { useGetMarketData, useGetSignal, useGetSignalHistory, getGetMarketDataQueryKey, getGetSignalQueryKey, getGetSignalHistoryQueryKey } from "@workspace/api-client-react";
import { SignalBadge } from "@/components/ui/signal-badge";
import { RsiGauge } from "@/components/ui/rsi-gauge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Activity, ArrowUpRight, ArrowDownRight, Clock, Cpu } from "lucide-react";

export default function Dashboard() {
  const [symbol, setSymbol] = useState("BTCUSDT");

  const { data: marketData, isLoading: isMarketLoading } = useGetMarketData(
    { symbol },
    { query: { queryKey: getGetMarketDataQueryKey({ symbol }), refetchInterval: 30000 } }
  );

  const { data: signalData, isLoading: isSignalLoading } = useGetSignal(
    { symbol },
    { query: { queryKey: getGetSignalQueryKey({ symbol }), refetchInterval: 30000 } }
  );

  const { data: historyData } = useGetSignalHistory({
    query: { queryKey: getGetSignalHistoryQueryKey(), refetchInterval: 30000 }
  });

  const recentHistory = historyData?.history?.slice(0, 5) || [];

  return (
    <div className="flex flex-col gap-5 md:gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">System Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">Live market data and AI signal generation.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-mono text-muted-foreground">ACTIVE PAIR:</span>
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="w-[140px] font-mono bg-card border-primary/20 hover:border-primary/50 transition-colors text-sm h-9">
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
        {/* Market Data Widget */}
        <Card className="md:col-span-2 bg-card border-border/50 shadow-lg relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                <Activity className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                Live Market Data
              </CardTitle>
              <CardDescription className="text-xs">Real-time pricing for {symbol}</CardDescription>
            </div>
            {isMarketLoading && <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
          </CardHeader>
          <CardContent>
            {marketData ? (
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mt-3 gap-4">
                <div>
                  <div className="text-4xl md:text-5xl font-mono font-bold tracking-tighter tabular-nums">
                    ${marketData.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className={`flex items-center gap-1 mt-2 font-mono text-sm ${marketData.priceChangePercent24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {marketData.priceChangePercent24h >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    <span>{Math.abs(marketData.priceChangePercent24h).toFixed(2)}%</span>
                    <span className="text-muted-foreground ml-1">24h</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 w-full sm:w-auto">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground tracking-widest uppercase">24h High</span>
                    <span className="font-mono text-sm">${marketData.high24h.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground tracking-widest uppercase">24h Low</span>
                    <span className="font-mono text-sm">${marketData.low24h.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col col-span-2">
                    <span className="text-[10px] text-muted-foreground tracking-widest uppercase">24h Volume</span>
                    <span className="font-mono text-sm">{marketData.volume24h.toLocaleString()} {symbol.replace('USDT', '')}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-28 flex items-center justify-center text-muted-foreground font-mono text-sm">
                NO DATA AVAILABLE
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Signal Panel */}
        <Card className="bg-card border-border/50 shadow-[0_0_20px_rgba(0,240,255,0.05)] border-t-primary/30 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
              <Cpu className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              Genesis Engine
            </CardTitle>
            <CardDescription className="text-xs">Current AI recommendation</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            {signalData ? (
              <div className="flex flex-col gap-6 mt-2">
                <div className="flex flex-col items-center justify-center p-5 border border-border/40 rounded-lg bg-black/40 relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50" />
                  <span className="text-[10px] text-muted-foreground tracking-widest uppercase mb-3 z-10">Target Signal</span>
                  <SignalBadge signal={signalData.signal} className="text-xl px-5 py-1.5 z-10" />
                </div>
                <RsiGauge value={signalData.rsi} />
              </div>
            ) : isSignalLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-primary">
                <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <span className="font-mono text-xs animate-pulse">COMPUTING SIGNAL...</span>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
                SIGNAL OFFLINE
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Signal Feed */}
      <Card className="bg-card border-border/50 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-4 w-4 text-primary" />
              Recent Signals
            </CardTitle>
            <CardDescription className="text-xs">Latest events from the engine</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="font-mono text-xs h-8" asChild>
            <Link href="/signals">VIEW ALL</Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {recentHistory.length > 0 ? (
              recentHistory.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-md border border-border/30 bg-muted/20 hover:bg-muted/40 transition-colors gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <SignalBadge signal={item.signal} />
                    <span className="font-mono font-bold text-sm">{item.symbol.replace('USDT', '/USDT')}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono shrink-0">
                    <span className="text-muted-foreground hidden sm:inline">RSI: {item.rsi.toFixed(1)}</span>
                    <span className="text-muted-foreground">${item.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className="opacity-40 hidden sm:inline">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center p-8 text-muted-foreground font-mono text-sm border border-dashed border-border/50 rounded-md">
                NO HISTORY FOUND
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
