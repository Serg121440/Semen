import { RefreshCcw, ShieldAlert, TrendingUp } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/card";
import { Metric } from "@/components/metric";
import { PositionsTable } from "@/components/positions-table";
import { StatusPill } from "@/components/status-pill";
import { compact, money, riskClass } from "@/lib/format";
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
            Dashboard
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/rescue"
            className="rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-semibold uppercase text-gold-400 transition hover:bg-gold-500/15"
          >
            Rescue Mode
          </Link>
          <StatusPill label={data.health.dry_run ? "DRY RUN" : "LIVE"} level="medium" />
          <StatusPill label={data.health.testnet ? "TESTNET" : "MAINNET"} level="high" />
          <StatusPill label={data.health.live_trading ? "LIVE TRADING" : "NO ORDERS"} />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="USDT Balance">
          <Metric label="Wallet" value={`${money(data.balance.wallet_balance)} USDT`} tone="gold" />
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-silver-500">
            <div>Equity</div>
            <div className="text-right text-silver-400">{money(data.balance.equity)}</div>
            <div>Available</div>
            <div className="text-right text-silver-400">
              {money(data.balance.available_balance)}
            </div>
          </div>
        </Card>

        <Card title={symbol}>
          <Metric label="Current Price" value={money(data.market.current_price)} tone="default" />
          <div className="mt-4 text-sm text-silver-500">
            tick {data.market.rules.tick_size} / qty step {data.market.rules.qty_step}
          </div>
        </Card>

        <Card title="Total PnL">
          <Metric
            label="Unrealised"
            value={`${money(totalPnl)} USDT`}
            tone={totalPnl < 0 ? "red" : "green"}
          />
          <div className="mt-4 text-sm text-silver-500">
            {data.positions.positions.filter((position) => Number(position.size) > 0).length} active positions
          </div>
        </Card>

        <Card title="Risk Status">
          <div className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold uppercase ${riskClass(riskLevel)}`}>
            {String(riskLevel).toUpperCase()}
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
        <Card title="Current Position">
          {activePosition ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Metric
                label="Side"
                value={activePosition.side === "Buy" ? "Long" : "Short"}
                tone="gold"
              />
              <Metric label="Size" value={`${compact(activePosition.size)} BTC`} />
              <Metric label="Leverage" value={`${activePosition.leverage}x`} tone="red" />
              <Metric label="Entry" value={money(activePosition.avgPrice)} />
              <Metric label="Mark" value={money(activePosition.markPrice)} />
              <Metric
                label="Liquidation"
                value={money(activePosition.liqPrice ?? activePosition.liquidationPrice)}
                tone="red"
              />
            </div>
          ) : (
            <div className="text-sm text-silver-500">No active BTCUSDT position.</div>
          )}
        </Card>

        <Card title="Warnings">
          <div className="space-y-3">
            {rescue?.warnings?.length ? (
              rescue.warnings.map((warning) => (
                <div
                  key={warning}
                  className="flex gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-silver-500">
                No critical warnings.
              </div>
            )}
          </div>
        </Card>
      </section>

      <Card title="Positions">
        <PositionsTable
          positions={data.positions.positions}
          rescue={rescue}
        />
      </Card>

      {rescue ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <Card title="Rescue Mode">
            <div className="grid gap-4 md:grid-cols-2">
              <Metric label="Distance to Breakeven" value={money(rescue.distance_to_breakeven)} tone="gold" />
              <Metric label="Required Rebound" value={`${money(rescue.required_rebound_percent)}%`} />
              <Metric label="Loss / Balance" value={`${money(rescue.loss_to_balance_percent)}%`} tone="red" />
              <Metric label="Drawdown" value={`${money(rescue.drawdown_percent)}%`} tone="red" />
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

          <Card title="Scenario A: Reduce Risk">
            <div className="grid gap-3 text-sm">
              <ScenarioRow
                label="Close 25%"
                qty={rescue.conservative_scenario.close_25_qty}
                loss={rescue.conservative_scenario.realized_loss_25}
                remaining={rescue.conservative_scenario.remaining_qty_25}
              />
              <ScenarioRow
                label="Close 50%"
                qty={rescue.conservative_scenario.close_50_qty}
                loss={rescue.conservative_scenario.realized_loss_50}
                remaining={rescue.conservative_scenario.remaining_qty_50}
              />
            </div>
          </Card>

          <Card title="Scenario B: Breakeven Recovery">
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

          <Card title="Scenario C: Controlled Averaging">
            <div className="space-y-3">
              {Object.entries(rescue.averaging_scenario).map(([name, data]) => (
                <div key={name} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <TrendingUp className="h-4 w-4 text-gold-400" />
                    {name.replaceAll("_", " ")}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-silver-500 md:grid-cols-5">
                    <span>add {compact(data.add_qty)}</span>
                    <span>cost {money(data.estimated_cost)}</span>
                    <span>avg {money(data.new_avg_price)}</span>
                    <span>qty {compact(data.new_total_qty)}</span>
                    <span>rebound {money(data.required_rebound_percent)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      <footer className="flex items-center justify-between border-t border-white/10 py-5 text-xs text-silver-500">
        <span>Frontend is calculation-only. No order buttons are implemented.</span>
        <span className="inline-flex items-center gap-2">
          <RefreshCcw className="h-3.5 w-3.5" />
          Data loads from FastAPI on refresh
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
      <div className="text-silver-500">qty {compact(qty)}</div>
      <div className="text-red-300">loss {money(loss)}</div>
      <div className="text-silver-500">left {compact(remaining)}</div>
    </div>
  );
}
