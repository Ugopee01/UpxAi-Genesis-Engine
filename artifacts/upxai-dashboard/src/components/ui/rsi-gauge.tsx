export function RsiGauge({ value, className = "" }: { value: number; className?: string }) {
  // RSI is 0-100. 
  // < 30 is oversold (good buy area)
  // > 70 is overbought (good sell area)
  
  const getGradient = () => {
    if (value < 30) return "from-emerald-500 to-emerald-300";
    if (value > 70) return "from-rose-500 to-rose-300";
    return "from-amber-500 to-amber-300";
  };

  const getTextColor = () => {
    if (value < 30) return "text-emerald-400";
    if (value > 70) return "text-rose-400";
    return "text-amber-400";
  };

  const percent = Math.min(Math.max(value, 0), 100);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex justify-between items-end">
        <span className="text-xs font-medium text-muted-foreground tracking-widest uppercase">RSI Index</span>
        <span className={`font-mono text-xl font-bold ${getTextColor()}`}>{value.toFixed(2)}</span>
      </div>
      <div className="h-3 w-full bg-muted/50 rounded-full overflow-hidden border border-border/50 relative">
        <div 
          className={`h-full bg-gradient-to-r ${getGradient()} shadow-[0_0_10px_currentColor] transition-all duration-500 ease-out`}
          style={{ width: `${percent}%` }}
        />
        {/* Threshold markers */}
        <div className="absolute top-0 bottom-0 left-[30%] w-[1px] bg-border/80" />
        <div className="absolute top-0 bottom-0 left-[70%] w-[1px] bg-border/80" />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground/70">
        <span>0</span>
        <span>OVERSOLD (30)</span>
        <span>OVERBOUGHT (70)</span>
        <span>100</span>
      </div>
    </div>
  );
}
