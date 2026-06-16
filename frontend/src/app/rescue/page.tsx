import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/card";
import { Metric } from "@/components/metric";
import { RescuePlanner } from "@/components/rescue-planner";
import { StatusPill } from "@/components/status-pill";
import { money, riskClass } from "@/lib/format";
import { loadRescue } from "@/lib/api";

export default async function RescuePage() {
  const symbol = "BTCUSDT";
  const response = await loadRescue(symbol);
  const plan = response.rescue_plan;
  const side = plan.side === "Buy" ? "Long" : "Short";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-silver-500 transition hover:text-gold-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div className="mt-5 text-xs font-semibold uppercase tracking-[0.28em] text-gold-400">
            Rescue Mode
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white md:text-5xl">
            {symbol} {side}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill label={plan.risk_level.toUpperCase()} level={plan.risk_level} />
          <StatusPill label="CALCULATION ONLY" level="medium" />
          <StatusPill label="NO ORDER BUTTONS" />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Position">
          <Metric label="Qty" value={`${plan.qty} BTC`} tone="gold" />
          <div className="mt-4 text-sm text-silver-500">
            leverage {plan.leverage ?? "-"}x
          </div>
        </Card>
        <Card title="Prices">
          <Metric label="Avg Entry" value={money(plan.avg_price)} />
          <div className="mt-4 text-sm text-silver-500">
            mark {money(plan.mark_price)} / liq {money(plan.liquidation_price)}
          </div>
        </Card>
        <Card title="Current Loss">
          <Metric label="Unrealised PnL" value={`${money(plan.unrealised_pnl)} USDT`} tone="red" />
          <div className="mt-4 text-sm text-silver-500">
            {money(plan.loss_to_balance_percent)}% of balance
          </div>
        </Card>
        <Card title="Risk Score">
          <div
            className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold uppercase ${riskClass(
              plan.risk_level
            )}`}
          >
            {plan.risk_level}
          </div>
          <div className="mt-4 flex items-end gap-2">
            <div className="text-4xl font-semibold text-white">{plan.risk_score}</div>
            <div className="pb-1 text-sm text-silver-500">/ 100</div>
          </div>
        </Card>
      </section>

      <RescuePlanner initialPlan={plan} symbol={symbol} />

      <footer className="border-t border-white/10 py-5 text-xs text-silver-500">
        Rescue Mode is calculation-only in this MVP. Testnet order actions come later.
      </footer>
    </main>
  );
}
