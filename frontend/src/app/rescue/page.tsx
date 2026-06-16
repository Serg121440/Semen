import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/card";
import { Metric } from "@/components/metric";
import { RescuePlanner } from "@/components/rescue-planner";
import { StatusPill } from "@/components/status-pill";
import {
  money,
  riskClass,
  riskLabel,
  sideLabel
} from "@/lib/format";
import { loadRescue } from "@/lib/api";

type RescuePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RescuePage({ searchParams }: RescuePageProps) {
  const params = (await searchParams) ?? {};
  const symbol = firstParam(params.symbol) ?? "BTCUSDT";
  const requestedSide = firstParam(params.side);
  const response = await loadRescue(symbol, undefined, requestedSide);
  const plan = response.rescue_plan;
  const side = sideLabel(plan.side);
  const asset = symbol.replace(/USDT$/, "");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-silver-500 transition hover:text-gold-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Панель управления
          </Link>
          <div className="mt-5 text-xs font-semibold uppercase tracking-[0.28em] text-gold-400">
            Режим спасения
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white md:text-5xl">
            {symbol} {side}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill label={riskLabel(plan.risk_level)} level={plan.risk_level} />
          <StatusPill label="ТОЛЬКО РАСЧЕТ" level="medium" />
          <StatusPill label="БЕЗ ОРДЕРОВ" />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Позиция">
          <Metric label="Объем" value={`${plan.qty} ${asset}`} tone="gold" />
          <div className="mt-4 text-sm text-silver-500">
            плечо {plan.leverage ?? "-"}x
          </div>
        </Card>
        <Card title="Цены">
          <Metric label="Средний вход" value={money(plan.avg_price)} />
          <div className="mt-4 text-sm text-silver-500">
            mark {money(plan.mark_price)} / ликв. {money(plan.liquidation_price)}
          </div>
        </Card>
        <Card title="Текущий убыток">
          <Metric label="Нереализованный PnL" value={`${money(plan.unrealised_pnl)} USDT`} tone="red" />
          <div className="mt-4 text-sm text-silver-500">
            {money(plan.loss_to_balance_percent)}% от баланса
          </div>
        </Card>
        <Card title="Оценка риска">
          <div
            className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold uppercase ${riskClass(
              plan.risk_level
            )}`}
          >
            {riskLabel(plan.risk_level)}
          </div>
          <div className="mt-4 flex items-end gap-2">
            <div className="text-4xl font-semibold text-white">{plan.risk_score}</div>
            <div className="pb-1 text-sm text-silver-500">/ 100</div>
          </div>
        </Card>
      </section>

      <RescuePlanner
        initialPlan={plan}
        symbol={symbol}
        side={plan.side}
        initialTrend={response.trend}
        initialMarketAnalysis={response.market_analysis}
      />

      <footer className="border-t border-white/10 py-5 text-xs text-silver-500">
        Режим спасения в этом MVP только считает план. Тестовые ордера на Testnet подключим позже.
      </footer>
    </main>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
