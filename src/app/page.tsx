import { RefreshCcw, ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/card";
import { MarketAnalysis } from "@/components/market-analysis";
import { Metric } from "@/components/metric";
import { PositionsTable } from "@/components/positions-table";
import { RescueSimulator } from "@/components/rescue-simulator";
import { ScenarioDashboard } from "@/components/scenario-dashboard";
import {
  compact,
  money,
  riskClass,
  riskLabel,
  sideLabel,
  translateWarning
} from "@/lib/format";
import { loadDashboard } from "@/lib/api";
import type { Position, RescuePlan } from "@/lib/types";

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
  const equityNumber = Number(data.balance.equity ?? 0);
  const headerRiskScore = rescue?.risk_score ?? estimatePortfolioRisk(activePositions, equityNumber);
  const headerRiskLevel =
    rescue?.risk_level ?? (headerRiskScore >= 80 ? "critical" : headerRiskScore >= 60 ? "high" : headerRiskScore >= 35 ? "medium" : "low");

  return (
    <main className="min-h-screen bg-[radial-gradient(1100px_520px_at_78%_-12%,rgba(40,62,96,0.16),transparent_62%),#0a0c11] text-[#e7ebf2]">
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#0a0c11]/85 px-5 py-2.5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-[27px] w-[27px] items-center justify-center rounded-lg bg-gradient-to-br from-[#f5a623] to-[#ff7a3c] text-sm font-bold text-[#1a1206]">
              C
            </div>
            <div className="leading-none">
              <div className="text-sm font-semibold tracking-[0.01em] text-white">Trading Core</div>
              <div className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#5a6473]">
                Rescue Terminal
              </div>
            </div>
            <span className="rounded-md bg-gold-500/15 px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.05em] text-gold-300">
              {data.health.dry_run ? "DRY RUN" : "LIVE"}
            </span>
            <span className="rounded-md bg-white/[0.05] px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-[#7f8a99]">
              {data.health.live_trading ? "Торговля вкл." : "Без ордеров"}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="flex rounded-lg border border-white/[0.08] bg-[#0d1016] p-0.5">
              {scenarioTargets.map((target) => (
              <Link
                key={target.key}
                href={target.href}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  symbol.startsWith(target.key)
                    ? "bg-[#f5a623] text-[#1a1206]"
                    : "text-[#7f8a99] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {target.label}
              </Link>
            ))}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-base font-semibold text-white">{money(data.market.current_price)}</span>
              <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] font-semibold text-[#7f8a99]">
                {symbol}{selectedSide ? ` · ${sideLabel(selectedSide)}` : ""}
              </span>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex shrink-0 overflow-hidden rounded-xl border border-white/[0.07] bg-[#0e1118]">
            <HeaderVital label="Equity" value={`${money(data.balance.equity)} USDT`} tone={equityNumber < 0 ? "red" : "green"} />
            <HeaderVital label="uPnL" value={`${money(totalPnl)} USDT`} tone={totalPnl < 0 ? "red" : "green"} />
            <HeaderVital label="Риск" value={`${headerRiskScore} ${riskLabel(headerRiskLevel)}`} tone={headerRiskScore >= 70 ? "red" : headerRiskScore >= 45 ? "gold" : "green"} last />
          </div>
          <div className="h-8 w-8 rounded-full border border-white/[0.08] bg-[#1a1f29]" />
        </div>
      </header>

      <div className="flex items-center gap-0 border-b border-white/[0.06] bg-[#0c0e14]/50 px-5">
        {[
          ["overview", "Обзор"],
          ["positions", "Позиции"],
          ["analysis", "Анализ"],
          ["rescue", "Спасение"]
        ].map(([key, label]) => (
          <Link
            key={key}
            href={dashboardHref(symbol, selectedSide, key)}
            className={`relative px-5 py-3 text-sm font-semibold transition ${
              view === key ? "text-white" : "text-[#7f8a99] hover:text-silver-300"
            }`}
          >
            {label}
            <span className={`absolute inset-x-5 bottom-0 h-0.5 rounded-full ${view === key ? "bg-[#5b8cff]" : "bg-transparent"}`} />
          </Link>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2 font-mono text-[10.5px] text-[#5a6473]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          FastAPI · Bybit · сейчас
        </div>
      </div>

      <div className="dashboard-shell crypto-shell mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-5 py-5 lg:px-7">
      {view === "overview" ? (
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
      ) : null}

      {view === "overview" ? (
        <PositionSwitcher
          positions={activePositions}
          selectedSymbol={activePosition?.symbol}
          selectedSide={selectedSide}
          view={view}
        />
      ) : null}

      {view === "analysis" ? (
        <ScenarioDashboard
          key={`${symbol}-${selectedSide ?? ""}`}
          initialSymbol={asset === "ETH" ? "ETH" : "BTC"}
          selectedSymbol={symbol}
          currentPrice={data.market.current_price}
          marketAnalysis={data.marketAnalysis}
          switchTargets={scenarioTargets}
        />
      ) : null}

      {view === "overview" ? (
        <OverviewScreen
          activePosition={activePosition}
          positions={activePositions}
          rescue={rescue}
          totalPnl={totalPnl}
          equity={data.balance.equity}
          wallet={data.balance.wallet_balance}
          symbol={symbol}
          selectedSide={selectedSide}
        />
      ) : null}

      {view === "positions" ? (
        <PositionsScreen
          positions={data.positions.positions}
          rescue={rescue}
          selectedSymbol={activePosition?.symbol}
          selectedSide={selectedSide}
          view={view}
        />
      ) : null}

      {view === "analysis" ? (
        <MarketAnalysis analysis={data.marketAnalysis} />
      ) : null}

      {view === "rescue" && rescue ? (
        <RescueScreen
          positions={activePositions}
          rescue={rescue}
          wallet={data.balance.wallet_balance}
          equity={data.balance.equity}
          totalPnl={totalPnl}
        />
      ) : null}

      <footer className="flex items-center justify-between border-t border-white/10 py-5 text-xs text-silver-500">
        <span>Интерфейс работает только в режиме расчетов. Кнопок отправки ордеров нет.</span>
        <span className="inline-flex items-center gap-2">
          <RefreshCcw className="h-3.5 w-3.5" />
          Данные обновляются через FastAPI
        </span>
      </footer>
      </div>
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

function HeaderVital({
  label,
  value,
  tone = "default",
  last = false
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "red" | "gold";
  last?: boolean;
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-300"
      : tone === "red"
        ? "text-red-300"
        : tone === "gold"
          ? "text-gold-300"
          : "text-silver-300";

  return (
    <div className={`flex flex-col gap-0.5 px-4 py-2 ${last ? "" : "border-r border-white/[0.06]"}`}>
      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#5a6473]">
        {label}
      </span>
      <span className={`font-mono text-sm font-semibold ${toneClass}`}>
        {value}
      </span>
    </div>
  );
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

function OverviewScreen({
  activePosition,
  positions,
  rescue,
  totalPnl,
  equity,
  wallet,
  symbol,
  selectedSide
}: {
  activePosition: Position | null;
  positions: Position[];
  rescue: RescuePlan | null;
  totalPnl: number;
  equity: string | null | undefined;
  wallet: string | null | undefined;
  symbol: string;
  selectedSide?: string;
}) {
  const equityNumber = Number(equity ?? 0);
  const riskScore = rescue?.risk_score ?? estimatePortfolioRisk(positions, equityNumber);
  const riskLevel = rescue?.risk_level ?? (riskScore >= 80 ? "critical" : riskScore >= 60 ? "high" : riskScore >= 35 ? "medium" : "low");
  const threats = positions
    .map((position) => ({ position, distance: liquidationDistancePercent(position) }))
    .filter((item) => item.distance !== null)
    .sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999))
    .slice(0, 3);
  const verdict =
    riskScore >= 80
      ? "Счёт под давлением"
      : riskScore >= 60
        ? "Риск высокий"
        : riskScore >= 35
          ? "Нужен контроль"
          : "Счёт стабилен";
  const verdictText =
    riskScore >= 80
      ? "Главная задача сейчас - снизить риск и не добавлять плечо. Сначала убираем самые опасные позиции, потом ищем выход к безубытку."
      : riskScore >= 60
        ? "Позиции требуют активного контроля: есть высокое плечо и заметный отрицательный PnL. Работай от ликвидаций и защитных уровней."
        : riskScore >= 35
          ? "Рынок терпимый, но риск уже не фоновый. Следи за ближайшими ликвидациями и не расширяй сетку без плана."
          : "Критических сигналов немного. Можно анализировать сценарии без срочной защитной реакции.";

  return (
    <section className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        <Card className={`p-6 ${riskScore >= 70 ? "border-red-500/30 bg-red-500/[0.055]" : "border-gold-500/20 bg-gold-500/[0.035]"}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-silver-500">
                Состояние счёта
              </div>
              <div className="mt-2 text-3xl font-semibold text-white md:text-4xl">
                {verdict}
              </div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${riskClass(riskLevel)}`}>
              {riskLabel(riskLevel)}
            </span>
          </div>
          <div className="mb-5 grid gap-3 md:grid-cols-3">
            <CompactStat label="Equity" value={`${money(equity)} USDT`} tone={equityNumber < 0 ? "red" : "green"} />
            <CompactStat label="Кошелёк" value={`${money(wallet)} USDT`} />
            <CompactStat label="uPnL" value={`${money(totalPnl)} USDT`} tone={totalPnl < 0 ? "red" : "green"} />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-silver-300">{verdictText}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={dashboardHref(symbol, selectedSide, "rescue")}
              className="rounded-md bg-[#5b8cff] px-4 py-2 text-sm font-semibold text-[#070a10] transition hover:bg-[#7aa0ff]"
            >
              Открыть Rescue
            </Link>
            <Link
              href={dashboardHref(symbol, selectedSide, "analysis")}
              className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-silver-300 transition hover:bg-white/[0.07]"
            >
              Анализ рынка
            </Link>
          </div>
        </Card>

        <Card title="Риск-гейдж" className="p-5">
          <div className="flex items-end gap-2">
            <div className={`text-5xl font-semibold ${riskScore >= 70 ? "text-red-300" : riskScore >= 45 ? "text-gold-300" : "text-emerald-300"}`}>
              {riskScore}
            </div>
            <div className="pb-2 text-sm text-silver-500">/ 100</div>
          </div>
          <div className="mt-5 h-2 rounded-full bg-gradient-to-r from-emerald-400 via-gold-400 to-red-400">
            <div
              className="h-5 w-1 -translate-y-1.5 rounded bg-white shadow-[0_0_0_2px_#11151d]"
              style={{ marginLeft: `${Math.min(98, Math.max(0, riskScore))}%` }}
            />
          </div>
          <div className="mt-5 grid gap-2 text-sm text-silver-500">
            <div>позиций: <span className="font-mono text-silver-300">{positions.length}</span></div>
            <div>100x: <span className="font-mono text-red-300">{positions.filter((position) => Number(position.leverage || 0) >= 50).length}</span></div>
            <div>выбрано: <span className="font-mono text-gold-300">{activePosition ? `${activePosition.symbol} ${sideLabel(activePosition.side)}` : "-"}</span></div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <Card title="Ближайшие угрозы ликвидации">
          {threats.length ? (
            <div className="grid gap-3">
              {threats.map(({ position, distance }) => (
                <ThreatRow key={`${position.symbol}-${position.side}`} position={position} distance={distance ?? 0} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-silver-500">Ликвидационные уровни не получены.</div>
          )}
        </Card>

        <WarningsCard warnings={rescue?.warnings ?? []} />
      </div>
    </section>
  );
}

function ThreatRow({ position, distance }: { position: Position; distance: number }) {
  const dangerous = distance <= 8;
  const colorClass = dangerous ? "text-red-300" : distance <= 15 ? "text-gold-300" : "text-emerald-300";
  return (
    <div className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 md:grid-cols-[1fr_1fr_1fr] md:items-center">
      <div>
        <div className="font-mono font-semibold text-white">{position.symbol}</div>
        <div className="mt-1 text-xs text-silver-500">{sideLabel(position.side)} · {position.leverage}x</div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-[0.14em] text-silver-500">Ликвидация</div>
        <div className={`mt-1 font-mono font-semibold ${colorClass}`}>{money(position.liqPrice ?? position.liquidationPrice)}</div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-silver-500">
          <span>до ликв.</span>
          <span className={`font-mono font-semibold ${colorClass}`}>{distance.toFixed(2)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-[#0b0e14]">
          <div className={`h-full rounded ${dangerous ? "bg-red-400" : distance <= 15 ? "bg-gold-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(100, Math.max(5, distance * 4))}%` }} />
        </div>
      </div>
    </div>
  );
}

function PositionsScreen({
  positions,
  rescue,
  selectedSymbol,
  selectedSide,
  view
}: {
  positions: Position[];
  rescue: RescuePlan | null;
  selectedSymbol?: string;
  selectedSide?: string;
  view: string;
}) {
  const active = positions.filter((position) => Number(position.size) > 0);
  const selected = active.find(
    (position) => position.symbol === selectedSymbol && position.side === selectedSide
  );
  const totalPnl = active.reduce(
    (sum, position) => sum + Number(position.unrealisedPnl || 0),
    0
  );
  const totalValue = active.reduce((sum, position) => {
    const explicitValue = Number(position.positionValue || 0);
    if (explicitValue > 0) return sum + explicitValue;
    return sum + Number(position.size || 0) * Number(position.markPrice || 0);
  }, 0);
  const highLeverageCount = active.filter((position) => Number(position.leverage || 0) >= 50).length;
  const selectedText = selected ? `${selected.symbol} ${sideLabel(selected.side)}` : "-";

  return (
    <section className="grid gap-3">
      <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#10141b] shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
        <div className="flex flex-wrap items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-4">
          <div>
            <div className="text-xl font-semibold text-white">Открытые позиции</div>
            <div className="mt-1 text-sm text-silver-500">
              {active.length} активных · {highLeverageCount} с высоким плечом · сортировка по риску
            </div>
          </div>
          <div className="grid min-w-[360px] grid-cols-3 gap-6 text-right max-sm:min-w-0 max-sm:grid-cols-1 max-sm:text-left">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-silver-500">
                Суммарный uPnL
              </div>
              <div className={`mt-1 font-mono text-xl font-semibold ${totalPnl < 0 ? "text-red-300" : "text-emerald-300"}`}>
                {money(totalPnl)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-silver-500">
                Номинал
              </div>
              <div className="mt-1 font-mono text-xl font-semibold text-silver-300">
                {money(totalValue)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-silver-500">
                Выбрано
              </div>
              <div className="mt-1 truncate text-lg font-semibold text-gold-300">
                {selectedText}
              </div>
            </div>
          </div>
        </div>

        <PositionsTable
          positions={positions}
          rescue={rescue}
          selectedSymbol={selectedSymbol}
          selectedSide={selectedSide}
          view={view}
        />
      </div>
      <div className="text-xs text-silver-600">
        Подсвечены позиции с дистанцией до ликвидации меньше 8% или с сильной просадкой.
      </div>
    </section>
  );
}

function RescueScreen({
  positions,
  rescue,
  wallet,
  equity,
  totalPnl
}: {
  positions: Position[];
  rescue: RescuePlan;
  wallet: string | null | undefined;
  equity: string | null | undefined;
  totalPnl: number;
}) {
  const deadLong = positions.find((position) => position.symbol === "BTCUSDT" && position.side === "Buy");
  const ethLong = positions.find((position) => position.symbol === "ETHUSDT" && position.side === "Buy");
  const ethShort = positions.find((position) => position.symbol === "ETHUSDT" && position.side === "Sell");
  const btcShort = positions.find((position) => position.symbol === "BTCUSDT" && position.side === "Sell") ?? positions[0];
  const btcShortTp = btcShort?.takeProfit || "59 000";
  const projectedRelief = Math.abs(totalPnl) * 0.32;

  return (
    <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="grid gap-5">
        <div className="rounded-lg border border-[#5b8cff]/30 bg-[#10141b] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.20)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8aa6ff]">
            План выхода в плюс
          </div>
          <div className="mt-3 max-w-3xl text-2xl font-semibold leading-snug text-white">
            Стратегия в 3 шага: срезать мёртвый груз, снять хедж, сфокусировать капитал на рабочей идее.
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <PlanMetric label="Сейчас" value={money(equity)} tone={Number(equity || 0) < 0 ? "red" : "green"} />
            <PlanMetric label="Проекция плана" value={`+${money(projectedRelief)}`} tone="green" />
            <PlanMetric label="Цель +5%" value={`+${money(Number(wallet || 0) * 0.05)}`} tone="gold" />
          </div>
        </div>

        <RescueStep
          index={1}
          title="Срезать мёртвый груз — BTC Лонг"
          badge="маржа"
          badgeTone="blue"
          value={deadLong ? `+${money(Math.abs(Number(deadLong.positionValue || 0) * 0.1 || Number(deadLong.size || 0) * Number(deadLong.markPrice || 0) * 0.1))}$` : "+резерв"}
        >
          Вход {deadLong ? money(deadLong.avgPrice) : "далеко выше рынка"}, рынок против позиции: нужен большой отскок только для безубытка.
          Закрыть или резко сократить, освободить маржу и остановить каскадный риск.
        </RescueStep>

        <RescueStep
          index={2}
          title="Снять ETH-хедж"
          badge="риск −2 поз."
          badgeTone="gold"
        >
          {ethLong && ethShort
            ? `Лонг ${compact(ethLong.size)} и шорт ${compact(ethShort.size)} по ETH гасят друг друга и жгут маржу.`
            : "ETH-позиции частично компенсируют друг друга и удерживают лишнюю маржу."}
          Оставить только понятную направленную идею.
        </RescueStep>

        <RescueStep
          index={3}
          title={`Сфокусироваться на BTC-шорте → TP ${btcShortTp}`}
          badge={`+${money(projectedRelief)}$`}
          badgeTone="green"
        >
          Если рынок остаётся под давлением, основная рабочая идея — BTC-шорт. Свободный капитал не размазывать, а держать под этот сценарий и контроль риска.
        </RescueStep>
      </div>

      <RescueSimulator
        positions={positions}
        wallet={wallet}
        initialGoal={5}
      />
    </section>
  );
}

function PlanMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "red" | "green" | "gold";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-300"
      : tone === "green"
        ? "text-emerald-300"
        : "text-gold-300";

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-silver-500">
        {label}
      </div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function RescueStep({
  index,
  title,
  badge,
  badgeTone,
  value,
  children
}: {
  index: number;
  title: string;
  badge: string;
  badgeTone: "blue" | "gold" | "green";
  value?: string;
  children: ReactNode;
}) {
  const badgeClass =
    badgeTone === "blue"
      ? "bg-[#5b8cff]/15 text-[#8aa6ff]"
      : badgeTone === "green"
        ? "bg-emerald-500/15 text-emerald-300"
        : "bg-gold-500/15 text-gold-300";

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#10141b] p-5">
      <div className="flex items-start gap-4">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold ${badgeClass}`}>
          {index}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <span className={`rounded-lg px-3 py-1 font-mono text-xs font-semibold ${badgeClass}`}>
              {value ?? badge}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-silver-400">{children}</p>
        </div>
      </div>
    </div>
  );
}

function CompactStat({
  label,
  value,
  detail,
  tone = "default"
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "gold" | "red" | "green";
}) {
  const toneClass =
    tone === "gold"
      ? "text-gold-300"
      : tone === "red"
        ? "text-red-300"
        : tone === "green"
          ? "text-emerald-300"
          : "text-silver-300";

  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-silver-500">
        {label}
      </div>
      <div className={`mt-1 truncate text-xl font-semibold ${toneClass}`}>
        {value}
      </div>
      {detail ? <div className="mt-1 truncate text-xs text-silver-500">{detail}</div> : null}
    </div>
  );
}

function liquidationDistancePercent(position: Position): number | null {
  const mark = Number(position.markPrice || 0);
  const liquidation = Number(position.liqPrice ?? position.liquidationPrice ?? 0);
  if (!mark || !liquidation || !Number.isFinite(mark) || !Number.isFinite(liquidation)) return null;
  return Math.abs((liquidation - mark) / mark) * 100;
}

function estimatePortfolioRisk(positions: Position[], equity: number): number {
  const active = positions.filter((position) => Number(position.size || 0) > 0);
  if (!active.length) return 0;
  const highLeverage = active.filter((position) => Number(position.leverage || 0) >= 50).length;
  const loss = Math.abs(
    active
      .map((position) => Number(position.unrealisedPnl || 0))
      .filter((pnl) => pnl < 0)
      .reduce((sum, pnl) => sum + pnl, 0)
  );
  const nearest = Math.min(
    ...active
      .map(liquidationDistancePercent)
      .filter((distance): distance is number => distance !== null),
    100
  );
  const leverageScore = Math.min(35, highLeverage * 9);
  const lossScore = equity > 0 ? Math.min(35, (loss / equity) * 35) : 25;
  const liquidationScore = nearest < 5 ? 30 : nearest < 10 ? 22 : nearest < 18 ? 14 : 6;
  return Math.round(Math.min(100, leverageScore + lossScore + liquidationScore));
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
