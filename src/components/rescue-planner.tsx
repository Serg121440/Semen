"use client";

import { Copy, RefreshCcw, Target } from "lucide-react";
import { useState, useTransition } from "react";

import { Card } from "@/components/card";
import { MarketAnalysis } from "@/components/market-analysis";
import { Metric } from "@/components/metric";
import {
  averagingScenarioLabel,
  compact,
  money,
  riskClass,
  riskLabel,
  targetAverageLabel,
  trendAlignmentLabel,
  trendDirectionLabel,
  trendTone,
  translateStatus,
  translateWarning
} from "@/lib/format";
import type {
  MarketAnalysisResponse,
  RescuePlan,
  RescueResponse,
  TrendResponse
} from "@/lib/types";

type RescuePlannerProps = {
  initialPlan: RescuePlan;
  symbol: string;
  side?: string;
  initialTrend?: TrendResponse | null;
  initialMarketAnalysis?: MarketAnalysisResponse | null;
};

export function RescuePlanner({
  initialPlan,
  symbol,
  side,
  initialTrend = null,
  initialMarketAnalysis = null
}: RescuePlannerProps) {
  const [plan, setPlan] = useState(initialPlan);
  const [trend, setTrend] = useState(initialTrend);
  const [marketAnalysis, setMarketAnalysis] = useState(initialMarketAnalysis);
  const [targetAvg, setTargetAvg] = useState("");
  const [status, setStatus] = useState("Режим только расчетный. Ордер отправить нельзя.");
  const [isPending, startTransition] = useTransition();

  function refreshPlan(nextTargetAvg?: string) {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/rescue/${symbol}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            side: side || plan.side || null,
            target_avg: nextTargetAvg || null
          })
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = (await response.json()) as RescueResponse;
        setPlan(payload.rescue_plan);
        setTrend(payload.trend ?? null);
        setMarketAnalysis(payload.market_analysis ?? null);
        setStatus(translateStatus(payload.message));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Не удалось обновить план.");
      }
    });
  }

  async function copyPlan() {
    const text = [
      `ПЛАН СПАСЕНИЯ ${plan.symbol}`,
      `Риск: ${riskLabel(plan.risk_level)} ${plan.risk_score}/100`,
      `Объем: ${plan.qty}`,
      `Средняя: ${plan.avg_price}`,
      `Mark: ${plan.mark_price}`,
      `Безубыток: ${plan.breakeven_price}`,
      `Нужный отскок: ${plan.required_rebound_percent}%`,
      `Закрыть 25%: ${plan.conservative_scenario.close_25_qty}`,
      `Закрыть 50%: ${plan.conservative_scenario.close_50_qty}`
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setStatus("План скопирован.");
  }

  return (
    <div className="space-y-5">
      <Card title="Управление Rescue">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Оценка риска" value={`${plan.risk_score}/100`} tone="red" />
            <Metric label="Убыток / баланс" value={`${money(plan.loss_to_balance_percent)}%`} tone="red" />
            <Metric label="До безубытка" value={money(plan.distance_to_breakeven)} tone="gold" />
            <Metric label="Нужный отскок" value={`${money(plan.required_rebound_percent)}%`} />
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <label className="text-xs uppercase tracking-[0.14em] text-silver-500">
              Целевая средняя
            </label>
            <div className="mt-2 flex gap-2">
              <input
                value={targetAvg}
                onChange={(event) => setTargetAvg(event.target.value)}
                placeholder="72000"
                inputMode="decimal"
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-graphite-950 px-3 py-2 text-sm text-white outline-none focus:border-gold-500/60"
              />
              <button
                type="button"
                onClick={() => refreshPlan(targetAvg)}
                className="inline-flex items-center gap-2 rounded-md border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-sm text-gold-400"
              >
                <Target className="h-4 w-4" />
                Рассчитать
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => refreshPlan(targetAvg)}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-silver-400"
          >
            <RefreshCcw className="h-4 w-4" />
            Обновить данные
          </button>
          <button
            type="button"
            onClick={copyPlan}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-silver-400"
          >
            <Copy className="h-4 w-4" />
            Скопировать план
          </button>
          <span className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-silver-500">
            {isPending ? "Считаю..." : status}
          </span>
        </div>
      </Card>

      <Card title="Тренд перед решением">
        {trend ? (
          <div className="grid gap-4 md:grid-cols-4">
            <Metric
              label="Направление"
              value={trendDirectionLabel(trend.direction)}
              tone={trendTone(trend.alignment)}
            />
            <Metric
              label="Сила"
              value={`${trend.strength}/100`}
              tone={trendTone(trend.alignment)}
            />
            <Metric
              label="К позиции"
              value={trendAlignmentLabel(trend.alignment)}
              tone={trendTone(trend.alignment)}
            />
            <Metric label="Движение" value={`${money(trend.move_percent)}%`} />
            <div className="md:col-span-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-silver-400">
              {trend.summary}
            </div>
          </div>
        ) : (
          <div className="text-sm text-silver-500">
            Тренд пока не рассчитан. Обнови данные перед решением.
          </div>
        )}
      </Card>

      <MarketAnalysis analysis={marketAnalysis} />

      <section className="grid gap-4 xl:grid-cols-2">
        <Card title="Сценарий A: снизить риск">
          <div className="grid gap-3">
            <ScenarioLine
              label="Закрыть 25%"
              qty={plan.conservative_scenario.close_25_qty}
              loss={plan.conservative_scenario.realized_loss_25}
              remaining={plan.conservative_scenario.remaining_qty_25}
            />
            <ScenarioLine
              label="Закрыть 50%"
              qty={plan.conservative_scenario.close_50_qty}
              loss={plan.conservative_scenario.realized_loss_50}
              remaining={plan.conservative_scenario.remaining_qty_50}
            />
          </div>
        </Card>

        <Card title="Сценарий B: выход в безубыток">
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(plan.breakeven_scenario.levels).map(([level, price]) => (
              <div key={level} className="rounded-lg bg-white/[0.035] p-3">
                <div className="text-xs uppercase text-silver-500">{level}</div>
                <div className="mt-1 text-xl font-semibold text-silver-400">
                  {money(price)}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Сценарий C: контролируемое усреднение">
          <div className="space-y-3">
            {Object.entries(plan.averaging_scenario).map(([name, data]) => (
              <div key={name} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="font-semibold text-white">{averagingScenarioLabel(name)}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-silver-500 md:grid-cols-5">
                  <span>добавить {compact(data.add_qty)}</span>
                  <span>стоимость {money(data.estimated_cost)}</span>
                  <span>средняя {money(data.new_avg_price)}</span>
                  <span>объем {compact(data.new_total_qty)}</span>
                  <span>отскок {money(data.required_rebound_percent)}%</span>
                </div>
                {data.warnings.length ? (
                  <div className="mt-2 text-xs text-red-300">
                    {data.warnings.map(translateWarning).join(" ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Сценарий D: целевая средняя">
          {plan.target_average_scenario ? (
            <div className="grid gap-3 text-sm text-silver-400">
              {Object.entries(plan.target_average_scenario).map(([key, value]) => (
                <div key={key} className="flex justify-between rounded-lg bg-white/[0.035] px-3 py-2">
                  <span className="text-silver-500">{targetAverageLabel(key)}</span>
                  <span className="text-right text-white">{String(value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-silver-500">
              Введи целевую среднюю выше, чтобы рассчитать нужный объем добавления и стоимость.
            </div>
          )}
        </Card>
      </section>

      {plan.warnings.length ? (
        <Card title="Предупреждения">
          <div className="space-y-2">
            {plan.warnings.map((warning) => (
              <div
                key={warning}
                className={`rounded-lg border px-3 py-2 text-sm ${riskClass(plan.risk_level)}`}
              >
                {translateWarning(warning)}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ScenarioLine({
  label,
  qty,
  loss,
  remaining
}: {
  label: string;
  qty: string;
  loss: string;
  remaining: string;
}) {
  return (
    <div className="grid gap-2 rounded-lg bg-white/[0.035] p-3 text-sm md:grid-cols-4">
      <div className="font-semibold text-white">{label}</div>
      <div className="text-silver-500">объем {compact(qty)}</div>
      <div className="text-red-300">фикс. убыток {money(loss)}</div>
      <div className="text-silver-500">остаток {compact(remaining)}</div>
    </div>
  );
}
