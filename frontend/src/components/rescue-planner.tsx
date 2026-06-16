"use client";

import { Copy, RefreshCcw, Target } from "lucide-react";
import { useState, useTransition } from "react";

import { Card } from "@/components/card";
import { Metric } from "@/components/metric";
import { compact, money, riskClass } from "@/lib/format";
import type { RescuePlan, RescueResponse } from "@/lib/types";

type RescuePlannerProps = {
  initialPlan: RescuePlan;
  symbol: string;
};

export function RescuePlanner({ initialPlan, symbol }: RescuePlannerProps) {
  const [plan, setPlan] = useState(initialPlan);
  const [targetAvg, setTargetAvg] = useState("");
  const [status, setStatus] = useState("Calculation-only mode. No orders can be sent.");
  const [isPending, startTransition] = useTransition();

  function refreshPlan(nextTargetAvg?: string) {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/rescue/${symbol}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_avg: nextTargetAvg || null
          })
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = (await response.json()) as RescueResponse;
        setPlan(payload.rescue_plan);
        setStatus(payload.message);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to refresh plan.");
      }
    });
  }

  async function copyPlan() {
    const text = [
      `RESCUE PLAN ${plan.symbol}`,
      `Risk: ${plan.risk_level.toUpperCase()} ${plan.risk_score}/100`,
      `Qty: ${plan.qty}`,
      `Avg: ${plan.avg_price}`,
      `Mark: ${plan.mark_price}`,
      `Breakeven: ${plan.breakeven_price}`,
      `Required rebound: ${plan.required_rebound_percent}%`,
      `Close 25%: ${plan.conservative_scenario.close_25_qty}`,
      `Close 50%: ${plan.conservative_scenario.close_50_qty}`
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setStatus("Plan copied to clipboard.");
  }

  return (
    <div className="space-y-5">
      <Card title="Rescue Control">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Risk Score" value={`${plan.risk_score}/100`} tone="red" />
            <Metric label="Loss / Balance" value={`${money(plan.loss_to_balance_percent)}%`} tone="red" />
            <Metric label="To Breakeven" value={money(plan.distance_to_breakeven)} tone="gold" />
            <Metric label="Required Rebound" value={`${money(plan.required_rebound_percent)}%`} />
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <label className="text-xs uppercase tracking-[0.14em] text-silver-500">
              Target average
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
                Calculate
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
            Refresh data
          </button>
          <button
            type="button"
            onClick={copyPlan}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-silver-400"
          >
            <Copy className="h-4 w-4" />
            Copy plan
          </button>
          <span className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-silver-500">
            {isPending ? "Calculating..." : status}
          </span>
        </div>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card title="Scenario A: Reduce Risk">
          <div className="grid gap-3">
            <ScenarioLine
              label="Close 25%"
              qty={plan.conservative_scenario.close_25_qty}
              loss={plan.conservative_scenario.realized_loss_25}
              remaining={plan.conservative_scenario.remaining_qty_25}
            />
            <ScenarioLine
              label="Close 50%"
              qty={plan.conservative_scenario.close_50_qty}
              loss={plan.conservative_scenario.realized_loss_50}
              remaining={plan.conservative_scenario.remaining_qty_50}
            />
          </div>
        </Card>

        <Card title="Scenario B: Breakeven Recovery">
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

        <Card title="Scenario C: Controlled Averaging">
          <div className="space-y-3">
            {Object.entries(plan.averaging_scenario).map(([name, data]) => (
              <div key={name} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="font-semibold text-white">{name.replaceAll("_", " ")}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-silver-500 md:grid-cols-5">
                  <span>add {compact(data.add_qty)}</span>
                  <span>cost {money(data.estimated_cost)}</span>
                  <span>avg {money(data.new_avg_price)}</span>
                  <span>qty {compact(data.new_total_qty)}</span>
                  <span>rebound {money(data.required_rebound_percent)}%</span>
                </div>
                {data.warnings.length ? (
                  <div className="mt-2 text-xs text-red-300">{data.warnings.join(" ")}</div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Scenario D: Target Average">
          {plan.target_average_scenario ? (
            <div className="grid gap-3 text-sm text-silver-400">
              {Object.entries(plan.target_average_scenario).map(([key, value]) => (
                <div key={key} className="flex justify-between rounded-lg bg-white/[0.035] px-3 py-2">
                  <span className="text-silver-500">{key}</span>
                  <span className="text-right text-white">{String(value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-silver-500">
              Enter a target average above to calculate required add quantity and estimated cost.
            </div>
          )}
        </Card>
      </section>

      {plan.warnings.length ? (
        <Card title="Warnings">
          <div className="space-y-2">
            {plan.warnings.map((warning) => (
              <div
                key={warning}
                className={`rounded-lg border px-3 py-2 text-sm ${riskClass(plan.risk_level)}`}
              >
                {warning}
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
      <div className="text-silver-500">qty {compact(qty)}</div>
      <div className="text-red-300">realize {money(loss)}</div>
      <div className="text-silver-500">remaining {compact(remaining)}</div>
    </div>
  );
}
