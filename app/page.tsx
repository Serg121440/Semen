import { RefreshCcw, ShieldAlert, TrendingUp } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/card";
import { MarketAnalysis } from "@/components/market-analysis";
import { Metric } from "@/components/metric";
import { PositionsTable } from "@/components/positions-table";
import { StatusPill } from "@/components/status-pill";
import { ScenarioDashboard } from "@/components/scenario-dashboard";
import {
  averagingScenarioLabel,
  compact,
  money,
  riskClass,
  riskLabel,
  sideLabel,
  trendAlignmentLabel,
  trendDirectionLabel,
  trendTone,
  translateWarning
} from "@/lib/format";
import { loadDashboard } from "@/lib/api";
import type { Position } from "@/lib/types";

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = (await searchParams) ?? {};
  const requestedSymbol = firstParam(params.symbol) ?? "BTCUSDT";
  const requestedSide = firstParam(params.side);
  const view = normalizeView(firstParam(params.view));
  const data = await loadDashboard(requestedSymbol, requestedSide);
  const rescue = data.rescue?.rescue_plan ?? null;
  const activePosition = data.selectedPosition;
  const symbol = activePosition?.symbol ?? data.market.symbol;
  const asset = symbol.replace(/USDT$/, "");
  const selectedSide = activePosition?.side;
  const activePositions = data.positions.positions.filter(
    (position) => Number(position.size) > 0
  );
  const totalPnl = data.positions.positions.reduce(
    (sum, position) => sum + Number(position.unrealisedPnl || 0),
    0
  );
  const riskLevel = rescue?.risk_level ?? "low";
  const scenarioTargets = buildScenarioSwitchTargets(
    activePositions,
    symbol,
    selectedSide,
    view
  );

  return (
    <main className="dashboard-shell crypto-shell mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-4 px-5 py-5 lg:px-7">
      <header className="dashboard-header crypto-topbar flex flex-col gap-4 rounded-lg border border-white/10 bg-[#11151d]/95 p-4 shadow-gold-soft backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#f5a623] to-[#ff8a3c] text-sm font-bold text-[#1a1206]">
              C
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Crypto Monitor</div>
              <div className="text-xs text-silver-500">Bybit Trading Core</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-[#0b0e14] p-1">
            {[
              ["overview", "Обзор"],
              ["analysis", "Анализ"],
              ["positions", "Позиции"],
              ["rescue", "Rescue"]
            ].map(([key, label]) => (
              <Link
                key={key}
                href={dashboardHref(symbol, selectedSide, key)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  view === key
                    ? "bg-white/[0.07] text-white"
                    : "text-silver-500 hover:bg-white/[0.04] hover:text-silver-300"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
          <div className="flex rounded-lg bg-[#0b0e14] p-1">
            {scenarioTargets.map((target) => (
              <Link
                key={target.key}
                href={target.href}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  symbol.startsWith(target.key)
                    ? "bg-[#f5a623] text-[#1a1206]"
                    : "text-silver-500 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {target.label}
              </Link>
            ))}
          </div>
          <span className="font-mono text-sm text-silver-500">{symbol}</span>
          {selectedSide ? (
            <span className="rounded-md bg-white/[0.05] px-2 py-1 text-xs font-semibold text-silver-300">
              {sideLabel(selectedSide)}
            </span>
          ) : null}
          <span className="font-mono text-sm font-semibold text-white">
            {money(data.market.current_price)}
          </span>
          <span className={`rounded-md px-2 py-1 font-mono text-xs ${totalPnl < 0 ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>
            {money(totalPnl)} USDT
          </span>
          <Link
            href={`/rescue?symbol=${symbol}${selectedSide ? `&side=${selectedSide}` : ""}`}
            className="rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-semibold uppercase text-gold-400 transition hover:bg-gold-500/15"
          >
            Режим спасения
          </Link>
          <StatusPill label={data.health.dry_run ? "DRY RUN" : "LIVE"} level="medium" />
          <StatusPill label={data.health.live_trading ? "ТОРГОВЛЯ ВКЛ." : "БЕЗ ОРДЕРОВ"} />
        </div>
      </header>

      <section className="dashboard-metrics grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Капитал · Equity" className={Number(data.balance.equity) < 0 ? "border-red-500/35 bg-red-500/[0.06]" : ""}>
          <div className="flex items-start justify-between gap-3">
            <Metric
              label="Equity"
              value={`${money(data.balance.equity)} USDT`}
              tone={Number(data.balance.equity) < 0 ? "red" : "green"}
            />
            {Number(data.balance.equity) < 0 ? (
              <span className="rounded-full bg-gold-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-gold-300">
                риск
              </span>
            ) : null}
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] gap-3 text-sm">
            <div>
              <div className="text-xs text-silver-500">Кошелек</div>
              <div className="mt-1 font-mono text-silver-300">{money(data.balance.wallet_balance)}</div>
            </div>
            <div className="self-end pb-0.5 text-silver-700">+</div>
            <div>
              <div className="text-xs text-silver-500">Нереализ. PnL</div>
              <div className={`mt-1 font-mono ${totalPnl < 0 ? "text-red-300" : "text-emerald-300"}`}>
                {money(totalPnl)}
              </div>
            </div>
          </div>
        </Card>

        <Card title={`${symbol} · текущая цена`}>
          <Metric label="Текущая цена" value={money(data.market.current_price)} tone="default" />
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-silver-500">
            <span className="rounded-md bg-white/[0.04] px-2 py-1">
              шаг цены {data.market.rules.tick_size}
            </span>
            <span className="rounded-md bg-white/[0.04] px-2 py-1">
              шаг объема {data.market.rules.qty_step}
            </span>
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

      <PositionSwitcher
        positions={activePositions}
        selectedSymbol={activePosition?.symbol}
        selectedSide={selectedSide}
        view={view}
      />

      <ScenarioDashboard
        key={`${symbol}-${selectedSide ?? ""}`}
        initialSymbol={asset === "ETH" ? "ETH" : "BTC"}
        selectedSymbol={symbol}
        currentPrice={data.market.current_price}
        marketAnalysis={data.marketAnalysis}
        switchTargets={scenarioTargets}
      />

      {view === "overview" ? (
        <section className="dashboard-content-grid grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card title="Текущая позиция">
            {activePosition ? (
              <div className="grid gap-4 md:grid-cols-3">
                <Metric
                  label="Сторона"
                  value={sideLabel(activePosition.side)}
                  tone="gold"
                />
                <Metric label="Размер" value={`${compact(activePosition.size)} ${asset}`} />
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
              <div className="text-sm text-silver-500">Активных позиций нет.</div>
            )}
          </Card>

          <WarningsCard warnings={rescue?.warnings ?? []} />
        </section>
      ) : null}

      {view === "positions" ? (
        <Card title="Позиции">
          <PositionsTable
            positions={data.positions.positions}
            rescue={rescue}
            selectedSymbol={activePosition?.symbol}
            selectedSide={selectedSide}
            view={view}
          />
        </Card>
      ) : null}

      {view === "analysis" ? (
        <MarketAnalysis analysis={data.marketAnalysis} />
      ) : null}

      {view === "rescue" && rescue ? (
        <section className="dashboard-content-grid grid gap-4 xl:grid-cols-2">
          <Card title="Анализ тренда">
            {data.trend ? (
              <div className="grid gap-4 md:grid-cols-3">
                <Metric
                  label="Направление"
                  value={trendDirectionLabel(data.trend.direction)}
                  tone={trendTone(data.trend.alignment)}
                />
                <Metric
                  label="Сила"
                  value={`${data.trend.strength}/100`}
                  tone={trendTone(data.trend.alignment)}
                />
                <Metric
                  label="К позиции"
                  value={trendAlignmentLabel(data.trend.alignment)}
                  tone={trendTone(data.trend.alignment)}
                />
                <div className="md:col-span-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-silver-400">
                  {data.trend.summary}
                </div>
              </div>
            ) : (
              <div className="text-sm text-silver-500">Тренд пока не рассчитан.</div>
            )}
          </Card>

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

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeView(value: string | undefined): string {
  if (["overview", "positions", "rescue", "analysis"].includes(value ?? "")) {
    return value as string;
  }
  return "overview";
}

function dashboardHref(
  symbol: string | undefined,
  side: string | undefined,
  view: string
): string {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  if (side) params.set("side", side);
  params.set("view", view);
  return `/?${params.toString()}`;
}

function buildScenarioSwitchTargets(
  positions: Position[],
  selectedSymbol: string,
  selectedSide: string | undefined,
  view: string
) {
  return ([
    ["ETH", "ETHUSDT"],
    ["BTC", "BTCUSDT"]
  ] as const).map(([key, symbol]) => {
    const sameSymbol = selectedSymbol === symbol;
    const preferredPosition =
      positions.find((position) => position.symbol === symbol && position.side === (sameSymbol ? selectedSide : "Buy")) ??
      positions.find((position) => position.symbol === symbol && position.side === "Buy") ??
      positions.find((position) => position.symbol === symbol);
    return {
      key,
      label: key,
      href: dashboardHref(symbol, preferredPosition?.side, view)
    };
  });
}

function PositionSwitcher({
  positions,
  selectedSymbol,
  selectedSide,
  view
}: {
  positions: Position[];
  selectedSymbol?: string;
  selectedSide?: string;
  view: string;
}) {
  if (!positions.length) return null;

  return (
    <section className="dashboard-positions grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {positions.map((position) => {
        const isSelected =
          position.symbol === selectedSymbol && position.side === selectedSide;
        const pnl = Number(position.unrealisedPnl || 0);
        return (
          <Link
            key={`${position.symbol}-${position.side}`}
            href={dashboardHref(position.symbol, position.side, view)}
            className={`rounded-lg border p-4 transition ${
              isSelected
                ? "border-gold-500/40 bg-gold-500/10 shadow-gold-soft"
                : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-white">{position.symbol}</div>
              <div className="text-sm text-gold-300">{sideLabel(position.side)}</div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-silver-500">Размер</div>
                <div className="mt-1 text-silver-300">{compact(position.size)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-silver-500">Плечо</div>
                <div className="mt-1 text-red-300">{position.leverage}x</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-silver-500">PnL</div>
                <div className={`mt-1 ${pnl < 0 ? "text-red-300" : "text-emerald-300"}`}>
                  {money(position.unrealisedPnl)}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </section>
  );
}

function WarningsCard({ warnings }: { warnings: string[] }) {
  return (
    <Card title="Предупреждения">
      <div className="space-y-3">
        {warnings.length ? (
          warnings.map((warning) => (
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
