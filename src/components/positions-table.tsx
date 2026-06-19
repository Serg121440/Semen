import Link from "next/link";

import { compact, money, sideLabel } from "@/lib/format";
import type { Position, RescuePlan } from "@/lib/types";

type PositionsTableProps = {
  positions: Position[];
  rescue: RescuePlan | null;
  selectedSymbol?: string;
  selectedSide?: string;
  view?: string;
};

type RowModel = {
  position: Position;
  distance: number | null;
  move: number | null;
  pnl: number;
  isSelected: boolean;
  isDanger: boolean;
};

export function PositionsTable({
  positions,
  rescue,
  selectedSymbol,
  selectedSide,
  view = "positions"
}: PositionsTableProps) {
  const rows = positions
    .filter((position) => Number(position.size) > 0)
    .map((position): RowModel => {
      const distance = liquidationDistance(position);
      const move = movePercent(position);
      const pnl = Number(position.unrealisedPnl || 0);
      const isSelected =
        position.symbol === selectedSymbol && position.side === selectedSide;
      const rescueRisk =
        rescue && rescue.symbol === position.symbol && rescue.side === position.side
          ? rescue.risk_level
          : null;
      return {
        position,
        distance,
        move,
        pnl,
        isSelected,
        isDanger:
          rescueRisk === "critical" ||
          rescueRisk === "high" ||
          (distance !== null && distance < 8) ||
          (move !== null && move < -15)
      };
    })
    .sort((a, b) => {
      if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
      return (a.distance ?? 999) - (b.distance ?? 999);
    });

  if (rows.length === 0) {
    return (
      <div className="p-5 text-sm text-silver-500">
        Открытых позиций нет.
      </div>
    );
  }

  const totalPnl = rows.reduce((sum, row) => sum + row.pnl, 0);

  return (
    <div className="overflow-hidden">
      <div className="hidden grid-cols-[1.55fr_0.75fr_0.9fr_0.9fr_0.9fr_1.35fr_0.8fr_1fr] border-b border-white/[0.06] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-silver-500 xl:grid">
        <span>Инструмент</span>
        <span>Размер</span>
        <span>Вход</span>
        <span>Mark</span>
        <span>Ликв.</span>
        <span>До ликвидации</span>
        <span>% хода</span>
        <span className="text-right">uPnL · TP</span>
      </div>

      <div className="divide-y divide-white/[0.045]">
        {rows.map((row) => (
          <PositionRow key={`${row.position.symbol}-${row.position.side}`} row={row} view={view} />
        ))}
      </div>

      <div className="grid gap-3 border-t border-white/[0.07] px-5 py-4 text-sm text-silver-500 md:grid-cols-[1fr_auto_auto] md:items-center">
        <div className="font-semibold uppercase tracking-[0.12em]">
          Итого · {rows.length} поз.
        </div>
        <div className="font-mono text-xs">
          нетто: {netBySymbol(rows, "BTCUSDT")} · {netBySymbol(rows, "ETHUSDT")}
        </div>
        <div className={`text-right font-mono text-lg font-semibold ${totalPnl < 0 ? "text-red-300" : "text-emerald-300"}`}>
          {money(totalPnl)}
        </div>
      </div>
    </div>
  );
}

function PositionRow({ row, view }: { row: RowModel; view: string }) {
  const { position, distance, move, pnl, isSelected, isDanger } = row;
  const sideTone = position.side === "Buy" ? "text-emerald-300" : "text-red-300";
  const sideMark = position.side === "Buy" ? "▲" : "▼";
  const liquidation = position.liqPrice ?? position.liquidationPrice;

  return (
    <Link
      href={`/?symbol=${position.symbol}&side=${position.side}&view=${view}`}
      className={`grid gap-3 px-5 py-4 transition xl:grid-cols-[1.55fr_0.75fr_0.9fr_0.9fr_0.9fr_1.35fr_0.8fr_1fr] xl:items-center ${
        isSelected
          ? "bg-gold-500/[0.10] shadow-[inset_3px_0_0_rgba(245,166,35,0.85)]"
          : isDanger
            ? "bg-red-500/[0.055]"
            : "bg-transparent hover:bg-white/[0.025]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-sm ${position.side === "Buy" ? "bg-emerald-400" : "bg-red-400"}`} />
          <span className="truncate text-lg font-semibold text-gold-300">
            {position.symbol}
          </span>
          {isSelected ? (
            <span className="rounded-md bg-gold-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-gold-300">
              выбрано
            </span>
          ) : null}
        </div>
        <div className={`mt-1 font-mono text-xs font-semibold ${sideTone}`}>
          {sideMark} {sideLabel(position.side)} · {position.leverage || "-"}x
        </div>
      </div>

      <TableMetric label="Размер" value={compact(position.size)} />
      <TableMetric label="Вход" value={money(position.avgPrice)} />
      <TableMetric label="Mark" value={money(position.markPrice)} />
      <TableMetric label="Ликв." value={liquidation ? money(liquidation) : "— cross"} tone={liquidation ? "red" : "muted"} />

      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-3 xl:mb-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-silver-500 xl:hidden">
            До ликвидации
          </span>
          <span className={`font-mono text-sm font-semibold ${distanceTone(distance)}`}>
            {distance === null ? "cross" : `${distance.toFixed(1)}%`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#1a2230]">
          <div
            className={`h-full rounded-full ${distanceBar(distance)}`}
            style={{ width: `${distance === null ? 8 : Math.min(100, Math.max(6, distance * 3.2))}%` }}
          />
        </div>
      </div>

      <TableMetric label="% хода" value={move === null ? "-" : `${move.toFixed(1)}%`} tone={move !== null && move < 0 ? "red" : "green"} />

      <div className="min-w-0 text-left xl:text-right">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-silver-500 xl:hidden">
          uPnL · TP
        </div>
        <div className={`mt-1 truncate font-mono text-base font-semibold xl:mt-0 ${pnl < 0 ? "text-red-300" : "text-emerald-300"}`}>
          {money(position.unrealisedPnl)}
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-silver-600">
          TP {position.takeProfit || "-"} · SL {position.stopLoss || "-"}
        </div>
      </div>
    </Link>
  );
}

function TableMetric({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "red" | "green" | "muted";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-300"
      : tone === "green"
        ? "text-emerald-300"
        : tone === "muted"
          ? "text-silver-600"
          : "text-silver-300";

  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-silver-500 xl:hidden">
        {label}
      </div>
      <div className={`mt-1 truncate font-mono text-sm font-semibold xl:mt-0 ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function liquidationDistance(position: Position): number | null {
  const mark = Number(position.markPrice || 0);
  const liquidation = Number(position.liqPrice ?? position.liquidationPrice ?? 0);
  if (!mark || !liquidation || !Number.isFinite(mark) || !Number.isFinite(liquidation)) return null;
  return Math.abs((liquidation - mark) / mark) * 100;
}

function movePercent(position: Position): number | null {
  const mark = Number(position.markPrice || 0);
  const entry = Number(position.avgPrice || 0);
  if (!mark || !entry || !Number.isFinite(mark) || !Number.isFinite(entry)) return null;
  const raw = ((mark - entry) / entry) * 100;
  return position.side === "Sell" ? -raw : raw;
}

function distanceTone(distance: number | null): string {
  if (distance === null) return "text-silver-600";
  if (distance < 8) return "text-red-300";
  if (distance < 15) return "text-gold-300";
  return "text-emerald-300";
}

function distanceBar(distance: number | null): string {
  if (distance === null) return "bg-silver-700";
  if (distance < 8) return "bg-red-400";
  if (distance < 15) return "bg-gold-400";
  return "bg-emerald-400";
}

function netBySymbol(rows: RowModel[], symbol: string): string {
  const net = rows
    .filter((row) => row.position.symbol === symbol)
    .reduce((sum, row) => {
      const size = Number(row.position.size || 0);
      return sum + (row.position.side === "Sell" ? -size : size);
    }, 0);

  if (!net) return `${symbol.replace("USDT", "")} 0`;
  const direction = net > 0 ? "лонг" : "шорт";
  return `${symbol.replace("USDT", "")} ≈${compact(Math.abs(net))} ${direction}`;
}
