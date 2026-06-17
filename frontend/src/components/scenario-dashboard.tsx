"use client";

import { Activity, ArrowDown, ArrowUp, Gauge, Layers3 } from "lucide-react";
import { useMemo, useState } from "react";

type SymbolKey = "BTC" | "ETH";
type LevelKind = "resistance" | "support" | "mid";
type FilterKind = "all" | "resistance" | "support";

type Candle = {
  o: number;
  h: number;
  l: number;
  c: number;
};

type Level = {
  price: string;
  label: string;
  kind: LevelKind;
};

type ScenarioConfig = {
  title: string;
  pair: string;
  keyLevel: string;
  bullish: string;
  bearish: string;
  upPath: string;
  downPath: string;
  range: [number, number];
  current: number;
  levels: Level[];
  candles: Candle[];
  lines: Array<{ y: number; label: string; kind: LevelKind }>;
};

const DATA: Record<SymbolKey, ScenarioConfig> = {
  BTC: {
    title: "Bitcoin",
    pair: "BTCUSDT",
    keyLevel: "64 100 - 64 253",
    bullish: "Выше 64 100 цена получает дорогу к 66 394 и 67 177.",
    bearish: "Ниже 62 580 продавцы ведут к 60 826 / 60 402.",
    upPath: "64 100 -> 66 394 -> 67 177",
    downPath: "62 580 -> 60 402 -> 58 181",
    range: [57500, 68000],
    current: 63125,
    levels: [
      { price: "67 177 - 67 343", label: "верхнее сопротивление", kind: "resistance" },
      { price: "66 394", label: "зона ликвидности", kind: "resistance" },
      { price: "64 253 - 64 100", label: "ближнее сопротивление", kind: "resistance" },
      { price: "62 580", label: "центр диапазона", kind: "mid" },
      { price: "60 826 - 60 402", label: "главная поддержка", kind: "support" },
      { price: "58 208 - 58 181", label: "следующая цель снизу", kind: "support" }
    ],
    lines: [
      { y: 67177, label: "67 177", kind: "resistance" },
      { y: 64100, label: "64 100", kind: "resistance" },
      { y: 62580, label: "62 580", kind: "mid" },
      { y: 60402, label: "60 402", kind: "support" },
      { y: 58181, label: "58 181", kind: "support" }
    ],
    candles: [
      { o: 67000, h: 67600, l: 66200, c: 66400 },
      { o: 66400, h: 66800, l: 64200, c: 64600 },
      { o: 64600, h: 65100, l: 61500, c: 62100 },
      { o: 62100, h: 62700, l: 59400, c: 60200 },
      { o: 60200, h: 61100, l: 58800, c: 60700 },
      { o: 60700, h: 62200, l: 60000, c: 61800 },
      { o: 61800, h: 63700, l: 61300, c: 63300 },
      { o: 63300, h: 64200, l: 62500, c: 63950 },
      { o: 63950, h: 64400, l: 62000, c: 62400 },
      { o: 62400, h: 63100, l: 61000, c: 61600 },
      { o: 61600, h: 63200, l: 61200, c: 62900 },
      { o: 62900, h: 64100, l: 62500, c: 63800 },
      { o: 63800, h: 64250, l: 62900, c: 63125 }
    ]
  },
  ETH: {
    title: "Ethereum",
    pair: "ETHUSDT",
    keyLevel: "1 640 - 1 662",
    bullish: "Удержание 1 640 - 1 662 и возврат выше 1 713 дают шанс на 1 765.",
    bearish: "Потеря 1 640 открывает 1 610, затем 1 571 и 1 501.",
    upPath: "1 713 -> 1 765 -> 1 801",
    downPath: "1 640 -> 1 610 -> 1 571",
    range: [1490, 1850],
    current: 1763,
    levels: [
      { price: "1 831 - 1 801", label: "сильное сопротивление", kind: "resistance" },
      { price: "1 765", label: "промежуточное сопротивление", kind: "resistance" },
      { price: "1 713 - 1 712", label: "зона реакции", kind: "resistance" },
      { price: "1 662 - 1 640", label: "ключевое удержание", kind: "mid" },
      { price: "1 610", label: "поддержка", kind: "support" },
      { price: "1 571", label: "следующая поддержка", kind: "support" },
      { price: "1 501 - 1 496", label: "нижняя цель", kind: "support" }
    ],
    lines: [
      { y: 1831, label: "1 831", kind: "resistance" },
      { y: 1765, label: "1 765", kind: "resistance" },
      { y: 1713, label: "1 713", kind: "resistance" },
      { y: 1640, label: "1 640", kind: "mid" },
      { y: 1610, label: "1 610", kind: "support" },
      { y: 1501, label: "1 501", kind: "support" }
    ],
    candles: [
      { o: 1760, h: 1788, l: 1690, c: 1708 },
      { o: 1708, h: 1720, l: 1585, c: 1608 },
      { o: 1608, h: 1640, l: 1534, c: 1575 },
      { o: 1575, h: 1625, l: 1540, c: 1618 },
      { o: 1618, h: 1695, l: 1602, c: 1680 },
      { o: 1680, h: 1714, l: 1655, c: 1698 },
      { o: 1698, h: 1710, l: 1660, c: 1672 },
      { o: 1672, h: 1705, l: 1650, c: 1695 },
      { o: 1695, h: 1758, l: 1688, c: 1748 },
      { o: 1748, h: 1832, l: 1735, c: 1815 },
      { o: 1815, h: 1842, l: 1760, c: 1772 },
      { o: 1772, h: 1788, l: 1748, c: 1763 }
    ]
  }
};

export function ScenarioDashboard() {
  const [symbol, setSymbol] = useState<SymbolKey>("BTC");
  const [filter, setFilter] = useState<FilterKind>("all");
  const data = DATA[symbol];
  const visibleLevels = useMemo(
    () => data.levels.filter((level) => filter === "all" || level.kind === filter),
    [data.levels, filter]
  );

  return (
    <section className="scenario-dashboard grid gap-4 xl:grid-cols-[1.42fr_0.58fr]">
      <div className="scenario-chart-card rounded-lg border border-white/10 bg-graphite-850/80 p-4 shadow-gold-soft">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">
              Быстрый сценарный график
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-white md:text-[28px]">
              {data.title} / TetherUS
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/20 p-1">
            {(["BTC", "ETH"] as SymbolKey[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSymbol(item)}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition duration-150 active:scale-[0.98] ${
                  symbol === item
                    ? "bg-gold-500/20 text-gold-300"
                    : "text-silver-500 hover:bg-white/[0.04] hover:text-silver-300"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="scenario-quick grid gap-3 md:grid-cols-3">
          <QuickMetric icon={<Gauge className="h-4 w-4" />} label="Ключевой уровень" value={data.keyLevel} />
          <QuickMetric icon={<ArrowUp className="h-4 w-4" />} label="Выше" value={data.upPath} tone="green" />
          <QuickMetric icon={<ArrowDown className="h-4 w-4" />} label="Ниже" value={data.downPath} tone="red" />
        </div>

        <div className="scenario-chart-frame mt-3 overflow-hidden rounded-lg border border-white/10 bg-[#09090b]">
          <ScenarioChart config={data} />
        </div>
      </div>

      <div className="scenario-side grid gap-4">
        <div className="scenario-card rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <ArrowUp className="h-4 w-4" />
            Сценарий вверх
          </div>
          <p className="text-sm leading-6 text-silver-400">{data.bullish}</p>
        </div>
        <div className="scenario-card rounded-lg border border-red-500/20 bg-red-500/10 p-4">
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-red-300">
            <ArrowDown className="h-4 w-4" />
            Сценарий вниз
          </div>
          <p className="text-sm leading-6 text-silver-400">{data.bearish}</p>
        </div>
        <div className="scenario-zones rounded-lg border border-white/10 bg-graphite-850/80 p-4 shadow-gold-soft">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
              <Layers3 className="h-4 w-4 text-gold-400" />
              Важные зоны
            </div>
            <div className="flex rounded-lg bg-black/20 p-1">
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
                    filter === key
                      ? "bg-white/10 text-white"
                      : "text-silver-500 hover:text-silver-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            {visibleLevels.map((level) => (
              <div
                key={`${level.price}-${level.kind}`}
                className={`grid grid-cols-[1fr_auto] gap-3 rounded-lg border px-3 py-2 text-sm ${levelTone(level.kind)}`}
              >
                <span className="font-semibold">{level.price}</span>
                <span className="text-right text-xs uppercase tracking-[0.1em] text-silver-500">
                  {level.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ScenarioChart({ config }: { config: ScenarioConfig }) {
  const width = 920;
  const height = 370;
  const pad = { top: 24, right: 84, bottom: 28, left: 44 };
  const [min, max] = config.range;
  const xStep = (width - pad.left - pad.right) / Math.max(config.candles.length - 1, 1);
  const y = (price: number) =>
    pad.top + ((max - price) / (max - min)) * (height - pad.top - pad.bottom);

  const pathUp = [
    [width - 210, y(config.current)],
    [width - 142, y(config.current * 1.025)],
    [width - 98, y(config.current * 1.005)],
    [width - 58, y(config.current * 1.07)]
  ];
  const pathDown = [
    [width - 205, y(config.current * 0.99)],
    [width - 155, y(config.current * 0.955)],
    [width - 108, y(config.current * 0.975)],
    [width - 64, y(config.current * 0.92)]
  ];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${config.pair} сценарный график`}
      className="block h-[300px] w-full md:h-[360px]"
    >
      <defs>
        <linearGradient id="chartFade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#d8b45d" stopOpacity="0.11" />
          <stop offset="100%" stopColor="#d8b45d" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill="#09090b" />
      <rect x={pad.left} y={pad.top} width={width - pad.left - pad.right} height={height - pad.top - pad.bottom} fill="url(#chartFade)" />

      {Array.from({ length: 6 }).map((_, index) => {
        const gy = pad.top + index * ((height - pad.top - pad.bottom) / 5);
        return (
          <line
            key={`grid-${index}`}
            x1={pad.left}
            x2={width - pad.right}
            y1={gy}
            y2={gy}
            stroke="rgba(255,255,255,0.07)"
          />
        );
      })}

      {config.lines.map((line) => (
        <g key={`${line.label}-${line.kind}`}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(line.y)}
            y2={y(line.y)}
            stroke={line.kind === "support" ? "#34d399" : line.kind === "resistance" ? "#f87171" : "#e8c875"}
            strokeOpacity="0.48"
            strokeWidth="2"
          />
          <text x={width - pad.right + 12} y={y(line.y) + 4} fill="#b9c0c9" fontSize="13" fontWeight="700">
            {line.label}
          </text>
        </g>
      ))}

      {config.candles.map((candle, index) => {
        const x = pad.left + index * xStep;
        const up = candle.c >= candle.o;
        const color = up ? "#34d399" : "#fb7185";
        const bodyY = Math.min(y(candle.o), y(candle.c));
        const bodyHeight = Math.max(Math.abs(y(candle.o) - y(candle.c)), 4);
        return (
          <g key={`${candle.o}-${index}`}>
            <line x1={x} x2={x} y1={y(candle.h)} y2={y(candle.l)} stroke={color} strokeWidth="2" />
            <rect
              x={x - 8}
              y={bodyY}
              width="16"
              height={bodyHeight}
              rx="2"
              fill={color}
              opacity="0.95"
            />
          </g>
        );
      })}

      <polyline points={pathUp.map((point) => point.join(",")).join(" ")} fill="none" stroke="#60a5fa" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pathDown.map((point) => point.join(",")).join(" ")} fill="none" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.86" />

      <g>
        <line x1={pad.left} x2={width - pad.right} y1={y(config.current)} y2={y(config.current)} stroke="#d8b45d" strokeDasharray="5 7" strokeOpacity="0.75" />
        <rect x={width - pad.right + 8} y={y(config.current) - 16} width="72" height="30" rx="6" fill="#d8b45d" fillOpacity="0.16" stroke="#d8b45d" strokeOpacity="0.35" />
        <text x={width - pad.right + 18} y={y(config.current) + 4} fill="#e8c875" fontSize="13" fontWeight="800">
          LIVE
        </text>
      </g>
    </svg>
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
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className={`mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] ${toneClass}`}>
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function levelTone(kind: LevelKind): string {
  if (kind === "resistance") {
    return "border-red-500/20 bg-red-500/10 text-red-200";
  }
  if (kind === "support") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  }
  return "border-gold-500/20 bg-gold-500/10 text-gold-200";
}
