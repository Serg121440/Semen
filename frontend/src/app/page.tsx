import { RefreshCcw, ShieldAlert, TrendingUp } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/card";
import { Metric } from "@/components/metric";
import { PositionsTable } from "@/components/positions-table";
import { StatusPill } from "@/components/status-pill";
import {
  averagingScenarioLabel,
  compact,
  money,
  riskClass,
  riskLabel,
  sideLabel,
  translateWarning
} from "@/lib/format";
import { loadDashboard } from "@/lib/api";

export default async function DashboardPage() {
  const symbol = "BTCUSDT";
  const data = await loadDashboard(symbol);
  const rescue = data.rescue?.rescue_plan ?? null;
  const activePosition = data.positions.positions.find(
    (position) => position.symbol === symbol && Number(position.size) > 0
  );
  const totalPnl = data.positions.positions.reduce(
    (sum, position) => sum + Number(position.unrealisedPnl || 0),
    0
  );
  const riskLevel = rescue?.risk_level ?? "low";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-400">
            Bybit Trading Core
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white md:text-5xl">
            Панель управления
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/rescue"
            className="rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-semibold uppercase text-gold-400 transition hover:bg-gold-500/15"
          >
            Режим спасения
          </Link>
          <StatusPill label={data.health.dry_run ? "DRY RUN" : "LIVE"} level="medium" />
          <StatusPill label={data.health.testnet ? "TESTNET" : "MAINNET"} level="high" />
          <StatusPill label={data.health.live_trading ? "ТОРГОВЛЯ ВКЛ." : "БЕЗ ОРДЕРОВ"} />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Баланс USDT">
          <Metric label="Кошелек" value={`${money(data.balance.wallet_balance)} USDT`} tone="gold" />
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-silver-500">
            <div>Капитал</div>
            <div className="text-right text-silver-400">{money(data.balance.equity)}</div>
            <div>Доступно</div>
            <div className="text-right text-silver-400">
              {money(data.balance.available_balance)}
            </div>
          </div>
        </Card>

        <Card title={symbol}>
          <Metric label="Текущая цена" value={money(data.market.current_price)} tone="default" />
          <div className="mt-4 text-sm text-silver-500">
            шаг цены {data.market.rules.tick_size} / шаг объема {data.market.rules.qty_step}
          </div>
        </Card>

        <Card title="Общий PnL">
          <Metric
            label="Нереализованный"
            value={`${money(totalPnl)} USDT`}
            tone={totalPnl < 0 ? "red" : "green"}
          />
          <div className="mt-4 text-sm text-silver-500">
            активных позиций: {data.positions.positions.filter((position) => Number(position.size) > 0).length}
          </div>
        </Card>

        <Card title="Статус риска">
          <div className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold uppercase ${riskClass(riskLevel)}`}>
            {riskLabel(riskLevel)}
          </div>
          <div className="mt-4 flex items-end gap-2">
            <div className="text-4xl font-semibold text-white">
              {rescue?.risk_score ?? 0}
            </div>
            <div className="pb-1 text-sm text-silver-500">/ 100</div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card title="Текущая позиция">
          {activePosition ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Metric
                label="Сторона"
                value={sideLabel(activePosition.side)}
                tone="gold"
              />
              <Metric label="Размер" value={`${compact(activePosition.size)} BTC`} />
              <Metric label="Плечо" value={`${activePosition.leverage}x`} tone="red" />
              <Metric label="Вход" value={money(activePosition.avgPrice)} />
              <Metric label="Mark" value={money(activePosition.markPrice)} />
              <Metric
                label="Ликвидация"
                value={money(activePosition.liqPrice ?? activePosition.liquidationPrice)}
                tone="red"
              />
            </div>
          ) : (
            <div className="text-sm text-silver-500">Активной позиции BTCUSDT нет.</div>
          )}
        </Card>

        <Card title="Предупреждения">
          <div className="space-y-3">
            {rescue?.warnings?.length ? (
              rescue.warnings.map((warning) => (
                <div
                  key={warning}
                  className="flex gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{translateWarning(warning)}</span>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-silver-500">
                Критических предупреждений нет.
              </div>
            )}
          </div>
        </Card>
      </section>

      <Card title="Позиции">
        <PositionsTable
          positions={data.positions.positions}
          rescue={rescue}
        />
      </Card>

      {rescue ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <Card title="Режим спасения">
            <div className="grid gap-4 md:grid-cols-2">
              <Metric label="До безубытка" value={money(rescue.distance_to_breakeven)} tone="gold" />
              <Metric label="Нужный отскок" value={`${money(rescue.required_rebound_percent)}%`} />
              <Metric label="Убыток / баланс" value={`${money(rescue.loss_to_balance_percent)}%`} tone="red" />
              <Metric label="Просадка" value={`${money(rescue.drawdown_percent)}%`} tone="red" />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                "Рассчитать Rescue Plan",
                "Рассчитать закрытие 25%",
                "Рассчитать закрытие 50%",
                "Рассчитать TP-лестницу",
                "Рассчитать усреднение",
                "Скопировать план",
                "Обновить данные"
              ].map((label) => (
                <button
                  key={label}
                  type="button"
                  className="rounded-md border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-sm text-gold-400 transition hover:bg-gold-500/15"
                >
                  {label}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Сценарий A: снизить риск">
            <div className="grid gap-3 text-sm">
              <ScenarioRow
                label="Закрыть 25%"
                qty={rescue.conservative_scenario.close_25_qty}
                loss={rescue.conservative_scenario.realized_loss_25}
                remaining={rescue.conservative_scenario.remaining_qty_25}
              />
              <ScenarioRow
                label="Закрыть 50%"
                qty={rescue.conservative_scenario.close_50_qty}
                loss={rescue.conservative_scenario.realized_loss_50}
                remaining={rescue.conservative_scenario.remaining_qty_50}
              />
            </div>
          </Card>

          <Card title="Сценарий B: выход в безубыток">
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(rescue.breakeven_scenario.levels).map(([level, price]) => (
                <div key={level} className="rounded-lg bg-white/[0.035] p-3">
                  <div className="text-xs uppercase text-silver-500">{level}</div>
                  <div className="mt-1 text-lg font-semibold text-silver-400">
                    {money(price)}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Сценарий C: контролируемое усреднение">
            <div className="space-y-3">
              {Object.entries(rescue.averaging_scenario).map(([name, data]) => (
                <div key={name} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <TrendingUp className="h-4 w-4 text-gold-400" />
                    {averagingScenarioLabel(name)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-silver-500 md:grid-cols-5">
                    <span>добавить {compact(data.add_qty)}</span>
                    <span>стоимость {money(data.estimated_cost)}</span>
                    <span>средняя {money(data.new_avg_price)}</span>
                    <span>объем {compact(data.new_total_qty)}</span>
                    <span>отскок {money(data.required_rebound_percent)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      <footer className="flex items-center justify-between border-t border-white/10 py-5 text-xs text-silver-500">
        <span>Интерфейс работает только в режиме расчетов. Кнопок отправки ордеров нет.</span>
        <span className="inline-flex items-center gap-2">
          <RefreshCcw className="h-3.5 w-3.5" />
          Данные обновляются через FastAPI
        </span>
      </footer>
    </main>
  );
}

function ScenarioRow({
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
    <div className="grid grid-cols-4 gap-3 rounded-lg bg-white/[0.035] p-3">
      <div className="font-semibold text-white">{label}</div>
      <div className="text-silver-500">объем {compact(qty)}</div>
      <div className="text-red-300">убыток {money(loss)}</div>
      <div className="text-silver-500">остаток {compact(remaining)}</div>
    </div>
  );
}
