import { Activity, Layers3 } from "lucide-react";

import { Card } from "@/components/card";
import { Metric } from "@/components/metric";
import {
  compact,
  money,
  trendAlignmentLabel,
  trendDirectionLabel,
  trendTone
} from "@/lib/format";
import type { MarketAnalysisResponse, TechnicalInterval } from "@/lib/types";

type MarketAnalysisProps = {
  analysis: MarketAnalysisResponse | null;
};

const intervalLabels: Record<string, string> = {
  "15": "15м",
  "60": "1ч",
  "240": "4ч",
  D: "1д"
};

export function MarketAnalysis({ analysis }: MarketAnalysisProps) {
  if (!analysis) {
    return (
      <Card title="Теханализ и ликвидность">
        <div className="text-sm text-silver-500">
          Данные теханализа пока не рассчитаны. Обнови страницу после редеплоя API.
        </div>
      </Card>
    );
  }

  const intervals = ["15", "60", "240", "D"]
    .map((key) => analysis.intervals[key])
    .filter(Boolean);
  const zones = analysis.liquidity_map.zones.slice(0, 8);

  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card title="Теханализ по интервалам">
        <div className="mb-4 grid gap-4 md:grid-cols-4">
          <Metric
            label="Консенсус"
            value={trendDirectionLabel(analysis.consensus.direction)}
            tone={trendTone(analysis.consensus.alignment)}
          />
          <Metric
            label="К позиции"
            value={trendAlignmentLabel(analysis.consensus.alignment)}
            tone={trendTone(analysis.consensus.alignment)}
          />
          <Metric label="Счёт" value={String(analysis.consensus.score)} />
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-silver-400 md:col-span-1">
            {analysis.consensus.summary}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {intervals.map((item) => (
            <TechnicalCard key={item.interval} item={item} />
          ))}
        </div>
      </Card>

      <Card title="Карта ликвидности">
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-silver-500">
          <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
          <span>{analysis.liquidity_map.source}</span>
        </div>
        <div className="space-y-2">
          {zones.map((zone, index) => (
            <div
              key={`${zone.side}-${zone.price}-${index}`}
              className="grid grid-cols-[1fr_0.9fr_0.8fr] gap-2 rounded-lg bg-white/[0.035] px-3 py-2 text-sm"
            >
              <div className={zoneTone(zone.side)}>
                {zone.label}
              </div>
              <div className="text-silver-400">{money(zone.price)}</div>
              <div className="text-right text-silver-500">
                {zone.side === "liquidation" ? "liq" : compact(zone.notional)}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {Object.entries(analysis.open_interest).map(([key, data]) => (
            <div key={key} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="text-xs uppercase tracking-[0.14em] text-silver-500">
                OI {intervalLabels[key] ?? data.interval}
              </div>
              <div className="mt-1 font-semibold text-silver-300">
                {data.open_interest ? compact(data.open_interest) : "-"}
              </div>
              <div className={Number(data.change_percent ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}>
                {data.change_percent ? `${money(data.change_percent)}%` : "-"}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function TechnicalCard({ item }: { item: TechnicalInterval }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <Activity className="h-4 w-4 text-gold-400" />
          {intervalLabels[item.interval] ?? item.interval}
        </div>
        <span className={`rounded-full border px-2 py-1 text-xs ${pillTone(item.alignment)}`}>
          {trendDirectionLabel(item.direction)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm text-silver-500">
        <span>RSI {money(item.rsi14)}</span>
        <span>MACD {money(item.macd.histogram, 4)}</span>
        <span>EMA20 {money(item.ema20)}</span>
        <span>EMA50 {money(item.ema50)}</span>
        <span>поддержка {money(item.support)}</span>
        <span>сопротивл. {money(item.resistance)}</span>
        <span>ATR {money(item.atr14)}</span>
        <span>объём x{money(item.volume_ratio)}</span>
      </div>
      <div className="mt-3 rounded-md bg-black/20 p-2 text-xs text-silver-500">
        {item.summary}
      </div>
    </div>
  );
}

function pillTone(alignment: string): string {
  if (alignment === "with_position") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (alignment === "against_position") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  return "border-gold-500/30 bg-gold-500/10 text-gold-300";
}

function zoneTone(side: string): string {
  if (side === "bid") return "text-emerald-300";
  if (side === "ask") return "text-red-300";
  return "text-gold-300";
}
