import Link from "next/link";

import { compact, money, riskClass, riskLabel, sideLabel } from "@/lib/format";
import type { Position, RescuePlan } from "@/lib/types";

type PositionsTableProps = {
  positions: Position[];
  rescue: RescuePlan | null;
  selectedSymbol?: string;
  selectedSide?: string;
  view?: string;
};

export function PositionsTable({
  positions,
  rescue,
  selectedSymbol,
  selectedSide,
  view = "positions"
}: PositionsTableProps) {
  const active = positions.filter((position) => Number(position.size) > 0);

  if (active.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 text-sm text-silver-500">
        Открытых позиций нет.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {active.map((position) => {
        const leverage = Number(position.leverage || 0);
        const pnl = Number(position.unrealisedPnl || 0);
        const isSelected =
          position.symbol === selectedSymbol && position.side === selectedSide;
        const level =
          rescue && rescue.symbol === position.symbol && rescue.side === position.side
            ? rescue.risk_level
            : leverage >= 50
              ? "high"
              : "low";

        return (
          <div
            key={`${position.symbol}-${position.side}`}
            className={`rounded-lg border p-4 transition ${
              isSelected
                ? "border-gold-500/40 bg-gold-500/10 shadow-gold-soft"
                : "border-white/10 bg-white/[0.035]"
            }`}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/?symbol=${position.symbol}&side=${position.side}&view=${view}`}
                  className="text-lg font-semibold text-gold-300 transition hover:text-gold-200"
                >
                  {position.symbol}
                </Link>
                <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-semibold text-silver-300">
                  {sideLabel(position.side)}
                </span>
                {isSelected ? (
                  <span className="rounded-md bg-gold-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-gold-300">
                    выбрано
                  </span>
                ) : null}
              </div>
              <span className={`rounded-full border px-2 py-1 text-xs ${riskClass(level)}`}>
                {riskLabel(level)}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <PositionCell label="Размер" value={compact(position.size)} />
              <PositionCell label="Средняя" value={money(position.avgPrice)} />
              <PositionCell label="Mark" value={money(position.markPrice)} />
              <PositionCell label="Ликв." value={money(position.liqPrice ?? position.liquidationPrice)} tone="red" />
              <PositionCell label="Плечо" value={`${position.leverage}x`} tone={leverage >= 50 ? "red" : "default"} />
              <PositionCell label="uPnL" value={money(position.unrealisedPnl)} tone={pnl < 0 ? "red" : "green"} />
              <PositionCell label="TP" value={position.takeProfit || "-"} />
              <PositionCell label="SL" value={position.stopLoss || "-"} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PositionCell({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "red" | "green";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-300"
      : tone === "green"
        ? "text-emerald-300"
        : "text-silver-300";

  return (
    <div className="min-w-0 rounded-lg bg-[#0b0e14]/70 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-silver-500">
        {label}
      </div>
      <div className={`mt-1 truncate font-mono text-sm font-semibold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
