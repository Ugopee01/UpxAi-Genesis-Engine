import { useState, type ReactElement } from "react";
import {
  useListExchanges,
  useConnectExchange,
  useDisconnectExchange,
  useTestExchange,
  getListExchangesQueryKey,
  type ExchangeStatus,
} from "@workspace/api-client-react";

type ExchangeId = "binance" | "bybit";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plug, ShieldCheck, ShieldAlert, ShieldQuestion, Trash2, Zap, Eye, EyeOff, KeyRound } from "lucide-react";

function BinanceLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 126.61 126.61" className={className} aria-label="Binance logo">
      <g fill="#F3BA2F">
        <path d="M38.73,53.2,63.31,28.62,87.9,53.21l14.3-14.3L63.31,0,24.43,38.9Z" />
        <path d="M0,63.3,14.3,49l14.3,14.3L14.3,77.61Z" />
        <path d="M38.73,73.41,63.31,98,87.9,73.4l14.31,14.29h0L63.31,126.61,24.43,87.72l-.02-.02Z" />
        <path d="M98,63.31l14.3-14.3,14.3,14.3-14.3,14.3Z" />
        <path d="M77.83,63.3h0L63.31,48.78,52.58,59.51h0l-1.23,1.23-2.54,2.54L48.79,63.3l0,0,14.52,14.52L77.83,63.31Z" />
      </g>
    </svg>
  );
}

function BybitLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-label="Bybit logo">
      <rect x="2" y="2" width="60" height="60" rx="12" fill="#F7A600" />
      <text
        x="32"
        y="44"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="800"
        fontSize="38"
        fill="#000"
      >
        B
      </text>
    </svg>
  );
}

const EXCHANGE_META: Record<
  string,
  { gradient: string; tagline: string; Logo: ({ className }: { className?: string }) => ReactElement }
> = {
  binance: {
    gradient: "from-yellow-500/20 via-amber-500/5 to-transparent",
    tagline: "World's largest crypto exchange by volume.",
    Logo: BinanceLogo,
  },
  bybit: {
    gradient: "from-orange-500/20 via-orange-500/5 to-transparent",
    tagline: "Derivatives & spot trading powerhouse.",
    Logo: BybitLogo,
  },
};

function StatusPill({ ex }: { ex: ExchangeStatus }) {
  if (!ex.configured) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest border border-border/50 bg-muted/30 text-muted-foreground">
        <ShieldQuestion className="h-3 w-3" /> Not Connected
      </span>
    );
  }
  if (ex.lastTestStatus === "ok") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
        <ShieldCheck className="h-3 w-3" /> Connected
      </span>
    );
  }
  if (ex.lastTestStatus === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest border border-rose-500/40 bg-rose-500/10 text-rose-400">
        <ShieldAlert className="h-3 w-3" /> Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest border border-amber-500/40 bg-amber-500/10 text-amber-400">
      <ShieldQuestion className="h-3 w-3" /> Untested
    </span>
  );
}

export default function Exchanges() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [connectingId, setConnectingId] = useState<ExchangeId | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const { data, isLoading } = useListExchanges({
    query: { queryKey: getListExchangesQueryKey() },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: getListExchangesQueryKey() });

  const connectMutation = useConnectExchange({
    mutation: {
      onSuccess: (resp) => {
        toast({
          title: "Credentials Saved",
          description: `${resp.name} is now linked. Run "Test Connection" to verify.`,
          className: "border-primary bg-card text-foreground font-mono",
        });
        setConnectingId(null);
        setApiKey("");
        setApiSecret("");
        setShowSecret(false);
        invalidate();
      },
      onError: (err) => {
        toast({
          title: "Connection Failed",
          description: (err as unknown as { error?: string })?.error || "Could not save credentials.",
          variant: "destructive",
          className: "font-mono",
        });
      },
    },
  });

  const disconnectMutation = useDisconnectExchange({
    mutation: {
      onSuccess: (resp) => {
        toast({
          title: "Disconnected",
          description: `${resp.name} credentials removed.`,
          className: "border-amber-500 bg-card text-foreground font-mono",
        });
        invalidate();
      },
    },
  });

  const testMutation = useTestExchange({
    mutation: {
      onSuccess: (resp) => {
        toast({
          title: resp.success ? "Connection Verified" : "Connection Failed",
          description: resp.message,
          variant: resp.success ? "default" : "destructive",
          className: `font-mono ${resp.success ? "border-emerald-500 bg-card" : ""}`,
        });
        invalidate();
      },
    },
  });

  const exchanges = data?.exchanges ?? [];
  const connectedCount = data?.connectedCount ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectingId) return;
    connectMutation.mutate({
      exchange: connectingId,
      data: { apiKey: apiKey.trim(), apiSecret: apiSecret.trim() },
    });
  };

  return (
    <div className="flex flex-col gap-5 md:gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Exchange Connections</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Link the Genesis Engine to your real trading accounts.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-mono text-muted-foreground">LINKED:</span>
          <span className={`font-mono text-sm font-bold px-2.5 py-1 rounded-md border ${
            connectedCount > 0
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-border/50 bg-muted/30 text-muted-foreground"
          }`}>
            {connectedCount} / {exchanges.length || 2}
          </span>
        </div>
      </div>

      {/* Security note */}
      <div className="flex items-start gap-3 p-4 rounded-md border border-primary/20 bg-primary/5 text-xs">
        <KeyRound className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-foreground font-mono uppercase tracking-widest text-[11px]">Security</p>
          <p className="text-muted-foreground leading-relaxed">
            Use <span className="text-foreground font-semibold">read-only or trade-only</span> API keys.
            Never grant withdrawal permissions. Your secret is stored on the server and never returned to the browser.
          </p>
        </div>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 gap-4 text-primary">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="font-mono text-xs animate-pulse">LOADING EXCHANGES...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {exchanges.map((ex) => {
            const meta = EXCHANGE_META[ex.exchange] ?? {
              gradient: "from-primary/10 to-transparent",
              tagline: "",
              Logo: null as unknown as ({ className }: { className?: string }) => ReactElement,
            };
            const Logo = meta.Logo;
            return (
              <Card key={ex.exchange} className="bg-card border-border/50 shadow-lg relative overflow-hidden flex flex-col">
                <div className={`absolute inset-0 bg-gradient-to-br ${meta.gradient} opacity-60 pointer-events-none`} />
                <CardHeader className="relative pb-3 flex flex-row items-start justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    {Logo && (
                      <div className="h-11 w-11 shrink-0 rounded-md bg-background/40 border border-border/40 flex items-center justify-center p-2">
                        <Logo className="h-full w-full" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <CardTitle className="text-xl md:text-2xl tracking-tight">{ex.name}</CardTitle>
                      <CardDescription className="text-xs mt-1">{meta.tagline}</CardDescription>
                    </div>
                  </div>
                  <StatusPill ex={ex} />
                </CardHeader>
                <CardContent className="relative flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-2.5 font-mono text-xs">
                    <div className="flex justify-between items-center border-b border-border/20 pb-2">
                      <span className="text-muted-foreground tracking-widest text-[10px] uppercase">API Key</span>
                      <span className="text-foreground">{ex.configured ? ex.apiKeyMasked : "—"}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-border/20 pb-2">
                      <span className="text-muted-foreground tracking-widest text-[10px] uppercase">Last Tested</span>
                      <span className="text-foreground">
                        {ex.lastTestedAt
                          ? new Date(ex.lastTestedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "Never"}
                      </span>
                    </div>
                    {ex.lastTestMessage && (
                      <div className={`p-2.5 rounded text-[11px] leading-relaxed ${
                        ex.lastTestStatus === "ok"
                          ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                          : "bg-rose-500/10 border border-rose-500/30 text-rose-400"
                      }`}>
                        {ex.lastTestMessage}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    {ex.configured ? (
                      <>
                        <Button
                          variant="outline"
                          className="flex-1 font-mono text-xs"
                          onClick={() => testMutation.mutate({ exchange: ex.exchange as ExchangeId })}
                          disabled={testMutation.isPending}
                        >
                          <Zap className="h-3.5 w-3.5 mr-1.5" />
                          {testMutation.isPending ? "TESTING..." : "TEST CONNECTION"}
                        </Button>
                        <Button
                          variant="outline"
                          className="font-mono text-xs border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-400"
                          onClick={() => disconnectMutation.mutate({ exchange: ex.exchange as ExchangeId })}
                          disabled={disconnectMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
                          <span className="hidden sm:inline">DISCONNECT</span>
                        </Button>
                      </>
                    ) : (
                      <Button
                        className="flex-1 font-mono text-xs h-10 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
                        onClick={() => {
                          setConnectingId(ex.exchange as ExchangeId);
                          setApiKey("");
                          setApiSecret("");
                          setShowSecret(false);
                        }}
                      >
                        <Plug className="h-3.5 w-3.5 mr-1.5" />
                        CONNECT {ex.name.toUpperCase()}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Connect Dialog */}
      <Dialog open={connectingId !== null} onOpenChange={(open) => !open && setConnectingId(null)}>
        <DialogContent className="bg-card border-primary/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono uppercase tracking-widest text-base">
              <Plug className="h-4 w-4 text-primary" />
              Connect {connectingId ? EXCHANGE_META[connectingId] && (connectingId === "binance" ? "Binance" : "Bybit") : ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Paste your API Key and Secret. The secret is sent once and stored server-side — it will never be displayed back to you.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] tracking-widest uppercase text-muted-foreground">API Key</Label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key"
                className="font-mono bg-black/40 border-border/50 h-11"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] tracking-widest uppercase text-muted-foreground">API Secret</Label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Paste your API secret"
                  className="font-mono bg-black/40 border-border/50 h-11 pr-10"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono leading-relaxed border-l-2 border-amber-500/40 pl-3">
              Use keys with <span className="text-amber-400">read</span> or <span className="text-amber-400">spot trade</span> permissions only. <span className="text-rose-400">Never</span> enable withdrawals.
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="font-mono text-xs"
                onClick={() => setConnectingId(null)}
              >
                CANCEL
              </Button>
              <Button
                type="submit"
                className="font-mono text-xs"
                disabled={connectMutation.isPending}
              >
                {connectMutation.isPending ? "SAVING..." : "SAVE & CONNECT"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
