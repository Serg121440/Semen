"use client";

import {
  Activity,
  ArrowDown,
  ArrowUp,
  Gauge,
  Layers3
} from "lucide-react";
import { useMemo, useState } from "react";

type SymbolKey = "BTC" | "ETH";
type LevelKind = "resistance" | "support" | "reaction" | "key" | "mid";
type FilterKind = "all" | "resistance" | "support";

type Level = {
  price: number;
  label: string;
  kind: LevelKind;
};

type Band = {
  from: number;
  to: number;
  tone: "red" | "gold" | "green";
};

type HeatRow = {
  price: number;
  volume: string;
  side: "longs" | "shorts";
  strength: number;
  magnet?: boolean;
};

type Setup = {
  title: string;
  probability: string;
  entry: string;
  targets: string;
  stop: string;
  rr: string;
  condition: string;
  tone: "green" | "red";
};

type ScenarioConfig = {
  title: string;
  pair: string;
  keyLevel: string;
  above: string;
  below: string;
  bullish: string;
  bearish: string;
  range: [number, number];
  current: number;
  levels: Level[];
  bands: Band[];
  closes: number[];
  heatmap: HeatRow[];
  longSetup: Setup;
  shortSetup: Setup;
};

const DATA: Record<SymbolKey, ScenarioConfig> = {
  BTC: {
    title: "Bitcoin / TetherUS",
    pair: "BTCUSDT",
    keyLevel: "66 800 - 67 400",
    above: "68 200 -> 69 500 -> 71 000",
    below: "66 800 -> 65 200 -> 63 800",
    bullish: "Закрепление выше 68 200 убирает ближнее давление и открывает движение к 69 500, затем к 71 000.",
    bearish: "Потеря 66 800 превращает диапазон в ловушку для лонгов и тянет цену к 65 200 / 63 800.",
    range: [63000, 71800],
    current: 67420,
    levels: [
      { price: 71000, label: "верхняя цель", kind: "resistance" },
      { price: 69500, label: "сопротивление", kind: "resistance" },
      { price: 68200, label: "триггер вверх", kind: "reaction" },
      { price: 67400, label: "верх ключа", kind: "key" },
      { price: 66800, label: "низ ключа", kind: "key" },
      { price: 65200, label: "поддержка", kind: "support" },
      { price: 63800, label: "нижняя цель", kind: "support" }
    ],
    bands: [
      { from: 71000, to: 69500, tone: "red" },
      { from: 67400, to: 66800, tone: "gold" }
    ],
    closes: [
      63900, 64200, 63800, 64600, 65100, 64800, 65600, 66200, 65900,
      66800, 67300, 67000, 67600, 68100, 67800, 67200, 66900, 67500,
      68000, 67700, 67100, 66800, 67200, 67600, 67900, 67420
    ],
    heatmap: [
      { price: 71000, volume: "$62M", side: "shorts", strength: 91 },
      { price: 69500, volume: "$48M", side: "shorts", strength: 76 },
      { price: 68200, volume: "$35M", side: "shorts", strength: 55 },
      { price: 67420, volume: "live", side: "shorts", strength: 0 },
      { price: 66800, volume: "$58M", side: "longs", strength: 100, magnet: true },
      { price: 65200, volume: "$41M", side: "longs", strength: 68 },
      { price: 63800, volume: "$29M", side: "longs", strength: 47 }
    ],
    longSetup: {
      title: "Лонг сетап",
      probability: "54%",
      entry: "66 800 - 67 400",
      targets: "68 200 · 69 500 · 71 000",
      stop: "65 900",
      rr: "1 : 3.1",
      condition: "Условие: удержание 66 800 и возврат выше 68 200.",
      tone: "green"
    },
    shortSetup: {
      title: "Шорт сетап",
      probability: "46%",
      entry: "пробой 66 800",
      targets: "65 200 · 63 800 · 62 600",
      stop: "68 450",
      rr: "1 : 2.8",
      condition: "Условие: закрепление ниже 66 800 и ретест снизу.",
      tone: "red"
    }
  },
  ETH: {
    title: "Ethereum / TetherUS",
    pair: "ETHUSDT",
    keyLevel: "1 640 - 1 662",
    above: "1 713 -> 1 765 -> 1 801",
    below: "1 640 -> 1 610 -> 1 571",
    bullish: "Удержание 1 640 - 1 662 и возврат выше 1 713 дают шанс на 1 765, затем 1 801.",
    bearish: "Потеря 1 640 открывает 1 610, затем 1 571 и нижний магнит 1 501.",
    range: [1558, 1858],
    current: 1773.28,
    levels: [
      { price: 1831, label: "верхний блок", kind: "resistance" },
      { price: 1801, label: "ликвидность", kind: "resistance" },
      { price: 1765, label: "середина", kind: "mid" },
      { price: 1713, label: "реакция", kind: "reaction" },
      { price: 1662, label: "верх ключа", kind: "key" },
      { price: 1640, label: "низ ключа", kind: "key" },
      { price: 1610, label: "поддержка", kind: "support" },
      { price: 1571, label: "следующая", kind: "support" }
    ],
    bands: [
      { from: 1831, to: 1801, tone: "red" },
      { from: 1662, to: 1640, tone: "gold" }
    ],
    closes: [
      1612, 1605, 1628, 1660, 1645, 1672, 1690, 1678, 1705,
      1730, 1718, 1742, 1760, 1748, 1772, 1790, 1805, 1796,
      1782, 1768, 1788, 1802, 1779, 1765, 1781, 1773
    ],
    heatmap: [
      { price: 1801, volume: "$48M", side: "shorts", strength: 84 },
      { price: 1773, volume: "live", side: "shorts", strength: 0 },
      { price: 1765, volume: "$31M", side: "longs", strength: 54 },
      { price: 1713, volume: "$22M", side: "longs", strength: 39 },
      { price: 1662, volume: "$34M", side: "longs", strength: 60 },
      { price: 1640, volume: "$57M", side: "longs", strength: 100, magnet: true },
      { price: 1610, volume: "$38M", side: "longs", strength: 67 },
      { price: 1571, volume: "$26M", side: "longs", strength: 46 }
    ],
    longSetup: {
      title: "Лонг сетап",
      probability: "55%",
      entry: "1 640 - 1 662",
      targets: "1 713 · 1 765 · 1 801",
      stop: "1 605",
      rr: "1 : 3.4",
      condition: "Условие: удержание 1 640 и возврат выше 1 713.",
      tone: "green"
    },
    shortSetup: {
      title: "Шорт сетап",
      probability: "45%",
      entry: "пробой 1 640",
      targets: "1 610 · 1 571 · 1 501",
      stop: "1 686",
      rr: "1 : 3.0",
      condition: "Условие: закрепление ниже 1 640 и ретест снизу.",
      tone: "red"
    }
  }
};

export function ScenarioDashboard({
  initialSymbol = "BTC"
}: {
  initialSymbol?: SymbolKey;
}) {
  const [symbol, setSymbol] = useState<SymbolKey>(initialSymbol);
  const [filter, setFilter] = useState<FilterKind>("all");
  const data = DATA[symbol];
  const visibleLevels = useMemo(
    () =>
      data.levels.filter((level) => {
        if (filter === "all") return true;
        if (filter === "resistance") return level.kind === "resistance" || level.kind === "reaction";
        return level.kind === "support";
      }),
    [data.levels, filter]
  );

  return (
    <section className="scenario-lab grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)]">
      <div className="scenario-panel rounded-lg border border-white/10 bg-[#11151d] p-5 shadow-gold-soft">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">
              <Activity className="h-4 w-4" />
              Сценарный анализ
            </div>
            <h2 className="text-2xl font-semibold text-white md:text-[32px]">{data.title}</h2>
            <div className="mt-2 text-sm text-silver-500">
              уровни, вероятные маршруты цены и зоны ликвидности
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-[#0b0e14] p-1">
            {(["ETH", "BTC"] as SymbolKey[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSymbol(item)}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition duration-150 active:scale-[0.98] ${
                  symbol === item
                    ? "bg-[#f5a623] text-[#1a1206]"
                    : "text-silver-500 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <QuickMetric icon={<Gauge className="h-4 w-4" />} label="Ключевой уровень" value={data.keyLevel} />
          <QuickMetric icon={<ArrowUp className="h-4 w-4" />} label="Выше" value={data.above} tone="green" />
          <QuickMetric icon={<ArrowDown className="h-4 w-4" />} label="Ниже" value={data.below} tone="red" />
        </div>

        <div className="scenario-chart-frame overflow-hidden rounded-lg border border-white/10 bg-[#080a0e]">
          <ScenarioChart config={data} />
        </div>
      </div>

      <aside className="scenario-side grid gap-4">
        <ScenarioCard
          tone="green"
          title="Сценарий вверх"
          icon={<ArrowUp className="h-4 w-4" />}
          text={data.bullish}
        />
        <ScenarioCard
          tone="red"
          title="Сценарий вниз"
          icon={<ArrowDown className="h-4 w-4" />}
          text={data.bearish}
        />
        <LevelList levels={visibleLevels} filter={filter} setFilter={setFilter} />
      </aside>

      <LiquidityHeatmap config={data} />
      <TradeSetups config={data} />
    </section>
  );
}

function ScenarioChart({ config }: { config: ScenarioConfig }) {
  const width = 940;
  const height = 360;
  const pad = { top: 16, right: 150, bottom: 40, left: 22 };
  const plotRight = width - pad.right;
  const plotBottom = height - pad.bottom;
  const [min, max] = config.range;
  const y = (price: number) =>
    pad.top + ((max - price) / (max - min)) * (plotBottom - pad.top);
  const xStep = (plotRight - 40 - pad.left) / Math.max(config.closes.length - 1, 1);
  const candleWidth = Math.min(13, xStep * 0.62);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${config.pair} сценарный график`}
      className="block h-[320px] w-full md:h-[390px] xl:h-[430px]"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`heat-${config.pair}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#3a6ea5" />
          <stop offset="50%" stopColor="#f5a623" />
          <stop offset="100%" stopColor="#ff5d6c" />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill="#080a0e" />

      {Array.from({ length: 5 }).map((_, index) => {
        const gy = pad.top + index * ((plotBottom - pad.top) / 4);
        return (
          <line
            key={`grid-${index}`}
            x1={pad.left}
            x2={plotRight}
            y1={gy}
            y2={gy}
            stroke="rgba(255,255,255,0.055)"
          />
        );
      })}

      {config.bands.map((band, index) => {
        const y1 = y(band.from);
        const y2 = y(band.to);
        return (
          <rect
            key={`${band.from}-${index}`}
            x={pad.left}
            y={Math.min(y1, y2)}
            width={plotRight - pad.left}
            height={Math.abs(y2 - y1)}
            fill={band.tone === "red" ? "rgba(255,93,108,0.065)" : "rgba(245,166,35,0.08)"}
          />
        );
      })}

      {config.levels.map((level) => {
        const yy = y(level.price);
        const color = levelColor(level.kind);
        const dashed = ["reaction", "key"].includes(level.kind);
        return (
          <g key={`${level.price}-${level.kind}`}>
            <line
              x1={pad.left}
              x2={plotRight}
              y1={yy}
              y2={yy}
              stroke={color}
              strokeOpacity="0.42"
              strokeWidth="1.2"
              strokeDasharray={dashed ? "4 5" : undefined}
            />
            <text
              x={plotRight + 12}
              y={yy + 4}
              fill={color}
              fillOpacity="0.95"
              fontSize="12"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {formatPrice(level.price)}
            </text>
          </g>
        );
      })}

      {config.closes.map((close, index) => {
        const open = index === 0 ? close - (config.pair === "BTCUSDT" ? 90 : 8) : config.closes[index - 1];
        const wick = config.pair === "BTCUSDT" ? 110 : 11;
        const high = Math.max(open, close) + (wick * (0.45 + ((index * 7) % 10) / 15));
        const low = Math.min(open, close) - (wick * (0.45 + ((index * 5) % 10) / 17));
        const x = pad.left + 14 + index * xStep;
        const up = close >= open;
        const color = up ? "#26c281" : "#ff5d6c";
        const openY = y(open);
        const closeY = y(close);
        return (
          <g key={`${close}-${index}`}>
            <line x1={x} x2={x} y1={y(high)} y2={y(low)} stroke={color} strokeWidth="1.4" />
            <rect
              x={x - candleWidth / 2}
              y={Math.min(openY, closeY)}
              width={candleWidth}
              height={Math.max(2, Math.abs(closeY - openY))}
              rx="1.5"
              fill={color}
            />
          </g>
        );
      })}

      <g>
        <line
          x1={pad.left}
          x2={plotRight}
          y1={y(config.current)}
          y2={y(config.current)}
          stroke="#5b7cff"
          strokeWidth="1.2"
          strokeDasharray="2 4"
        />
        <rect
          x={plotRight + 56}
          y={y(config.current) - 13}
          width="92"
          height="26"
          rx="7"
          fill="#5b7cff"
        />
        <text
          x={plotRight + 102}
          y={y(config.current) + 5}
          fill="#fff"
          fontSize="12.5"
          fontWeight="700"
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {formatPrice(config.current, config.pair === "BTCUSDT" ? 0 : 2)}
        </text>
        <text
          x={plotRight + 102}
          y={y(config.current) - 19}
          fill="#7d8aa8"
          fontSize="9"
          letterSpacing="0.1em"
          textAnchor="middle"
        >
          LIVE
        </text>
      </g>
    </svg>
  );
}

function LiquidityHeatmap({ config }: { config: ScenarioConfig }) {
  return (
    <div className="scenario-heatmap rounded-lg border border-white/10 bg-[#11151d] p-5 shadow-gold-soft xl:col-span-1">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-white">
            <span className="h-3.5 w-3.5 rounded bg-gradient-to-br from-[#f5a623] to-[#ff5d6c] shadow-[0_0_14px_rgba(255,93,108,0.45)]" />
            Тепловая карта ликвидности
          </div>
          <div className="mt-1 text-xs text-silver-500">Скопления ликвидаций и магнитные уровни</div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[10px] text-silver-500">мало</span>
          <div className="h-2 w-20 rounded-full bg-gradient-to-r from-[#3a6ea5] via-[#f5a623] to-[#ff5d6c]" />
          <span className="text-[10px] text-silver-500">много</span>
        </div>
      </div>

      <div className="grid gap-2">
        {config.heatmap.map((row) => {
          const isLive = row.volume === "live";
          return (
            <div key={`${row.price}-${row.volume}`} className="grid grid-cols-[58px_1fr_44px_46px] items-center gap-3">
              <span className={`font-mono text-xs ${row.magnet ? "font-semibold text-[#ffce85]" : isLive ? "text-[#5b7cff]" : "text-silver-300"}`}>
                {formatPrice(row.price)}
              </span>
              {isLive ? (
                <div className="border-t border-dashed border-[#5b7cff]" />
              ) : (
                <div className="relative h-5 overflow-hidden rounded bg-[#0e1219]">
                  <div
                    className={`h-full rounded ${row.strength > 80 ? "bg-gradient-to-r from-[#ff8a3c] to-[#ff5d6c] shadow-[0_0_16px_rgba(255,93,108,0.45)]" : row.strength > 55 ? "bg-gradient-to-r from-[#5b9bd5] to-[#f5a623]" : "bg-gradient-to-r from-[#3a6ea5] to-[#5b9bd5]"}`}
                    style={{ width: `${row.strength}%` }}
                  />
                  {row.magnet ? (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase tracking-[0.08em] text-white">
                      магнит
                    </span>
                  ) : null}
                </div>
              )}
              <span className={`text-right font-mono text-xs ${isLive ? "text-[#5b7cff]" : row.magnet ? "font-semibold text-white" : "text-silver-300"}`}>
                {row.volume}
              </span>
              <span className={`text-right text-[10px] font-semibold uppercase tracking-[0.04em] ${row.side === "shorts" ? "text-red-300" : "text-emerald-300"}`}>
                {isLive ? "текущ." : row.side === "shorts" ? "шорты" : "лонги"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TradeSetups({ config }: { config: ScenarioConfig }) {
  return (
    <div className="scenario-trades xl:col-span-1">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-silver-500">
        Варианты трейда
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TradeSetup setup={config.longSetup} direction="long" />
        <TradeSetup setup={config.shortSetup} direction="short" />
      </div>
    </div>
  );
}

function TradeSetup({ setup, direction }: { setup: Setup; direction: "long" | "short" }) {
  const isLong = setup.tone === "green";
  return (
    <div className={`rounded-lg border p-4 ${isLong ? "border-emerald-500/30 bg-emerald-500/[0.07]" : "border-red-500/30 bg-red-500/[0.07]"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className={`rounded-md px-3 py-1 text-xs font-semibold ${isLong ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
          {isLong ? "▲" : "▼"} {setup.title}
        </span>
        <span className="text-xs text-silver-500">
          вероятн. <b className="font-mono text-white">{setup.probability}</b>
        </span>
      </div>
      <div className="mb-4 rounded-lg bg-[#0b0e14] px-2 py-2">
        <TradePath direction={direction} />
      </div>
      <div className="grid gap-2 text-sm">
        <SetupRow label="Вход" value={setup.entry} />
        <SetupRow label="Цели" value={setup.targets} tone={isLong ? "green" : "red"} />
        <SetupRow label="Стоп" value={setup.stop} tone={isLong ? "red" : "green"} />
        <SetupRow label="R : R" value={setup.rr} tone="gold" strong />
      </div>
      <div className="mt-3 text-xs leading-5 text-silver-500">{setup.condition}</div>
    </div>
  );
}

function TradePath({ direction }: { direction: "long" | "short" }) {
  const points =
    direction === "long"
      ? "10,62 58,68 100,72 142,56 192,36 252,16"
      : "10,38 54,32 96,42 132,52 182,72 250,88";
  const arrow =
    direction === "long"
      ? [
          [252, 16, 239, 20],
          [252, 16, 248, 28]
        ]
      : [
          [250, 88, 237, 84],
          [250, 88, 246, 76]
        ];

  return (
    <svg viewBox="0 0 300 96" className="block h-24 w-full">
      {[1, 2, 3].map((item) => (
        <line
          key={item}
          x1="8"
          x2="292"
          y1={(96 / 4) * item}
          y2={(96 / 4) * item}
          stroke="#fff"
          strokeOpacity="0.05"
        />
      ))}
      <polyline
        points={points}
        fill="none"
        stroke="#5b7cff"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {arrow.map(([x1, y1, x2, y2], index) => (
        <line
          key={index}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#5b7cff"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function LevelList({
  levels,
  filter,
  setFilter
}: {
  levels: Level[];
  filter: FilterKind;
  setFilter: (filter: FilterKind) => void;
}) {
  return (
    <div className="scenario-zones rounded-lg border border-white/10 bg-[#11151d] p-4 shadow-gold-soft">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <Layers3 className="h-4 w-4 text-gold-400" />
          Важные зоны
        </div>
        <div className="flex rounded-lg bg-[#0b0e14] p-1">
          {[
            ["all", "Все"],
            ["resistance", "R"],
            ["support", "S"]
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key as FilterKind)}
              className={`min-w-9 rounded-md px-2 py-1 text-xs font-semibold transition duration-150 active:scale-[0.98] ${
                filter === key ? "bg-white/10 text-white" : "text-silver-500 hover:text-silver-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        {levels.map((level) => (
          <div
            key={`${level.price}-${level.kind}`}
            className={`grid grid-cols-[1fr_auto] gap-3 rounded-lg border px-3 py-2 text-sm ${levelTone(level.kind)}`}
          >
            <span className="font-mono font-semibold">{formatPrice(level.price)}</span>
            <span className="text-right text-xs uppercase tracking-[0.1em] text-silver-500">
              {level.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenarioCard({
  tone,
  title,
  icon,
  text
}: {
  tone: "green" | "red";
  title: string;
  icon: React.ReactNode;
  text: string;
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300"
      : "border-red-500/25 bg-red-500/[0.08] text-red-300";

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <p className="text-sm leading-6 text-silver-400">{text}</p>
    </div>
  );
}

function QuickMetric({
  icon,
  label,
  value,
  tone = "default"
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "green" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-300"
      : tone === "red"
        ? "text-red-300"
        : "text-gold-300";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className={`mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] ${toneClass}`}>
        {icon}
        {label}
      </div>
      <div className="font-mono text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function SetupRow({
  label,
  value,
  tone = "default",
  strong = false
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "red" | "gold";
  strong?: boolean;
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
    <div className={`flex items-center justify-between gap-3 ${strong ? "border-t border-white/10 pt-2" : ""}`}>
      <span className="text-xs text-silver-500">{label}</span>
      <span className={`text-right font-mono text-xs ${strong ? "font-semibold" : ""} ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

function levelColor(kind: LevelKind): string {
  if (kind === "resistance") return "#ff5d6c";
  if (kind === "support") return "#26c281";
  if (kind === "key" || kind === "mid") return "#f5a623";
  return "#5b7cff";
}

function levelTone(kind: LevelKind): string {
  if (kind === "resistance" || kind === "reaction") {
    return "border-red-500/20 bg-red-500/10 text-red-200";
  }
  if (kind === "support") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  }
  return "border-gold-500/20 bg-gold-500/10 text-gold-200";
}

function formatPrice(value: number, decimals = 0): string {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
