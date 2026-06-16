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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] border-separate border-spacing-y-2 text-sm">
        <thead className="text-left text-xs uppercase tracking-[0.14em] text-silver-500">
          <tr>
            <th className="px-3 py-2">Символ</th>
            <th className="px-3 py-2">Сторона</th>
            <th className="px-3 py-2">Размер</th>
            <th className="px-3 py-2">Средняя</th>
            <th className="px-3 py-2">Mark</th>
            <th className="px-3 py-2">Ликв.</th>
            <th className="px-3 py-2">Плечо</th>
            <th className="px-3 py-2">uPnL</th>
            <th className="px-3 py-2">TP / SL</th>
            <th className="px-3 py-2">Риск</th>
          </tr>
        </thead>
        <tbody>
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
              <tr
                key={`${position.symbol}-${position.side}`}
                className={`rounded-lg text-silver-400 ${
                  isSelected
                    ? "bg-gold-500/10 outline outline-1 outline-gold-500/30"
                    : "bg-white/[0.035]"
                }`}
              >
                <td className="rounded-l-lg px-3 py-3 font-semibold text-white">
                  <Link
                    href={`/?symbol=${position.symbol}&side=${position.side}&view=${view}`}
                    className="text-gold-300 transition hover:text-gold-200"
                  >
                    {position.symbol}
                  </Link>
                </td>
                <td className="px-3 py-3">{sideLabel(position.side)}</td>
                <td className="px-3 py-3">{compact(position.size)}</td>
                <td className="px-3 py-3">{money(position.avgPrice)}</td>
                <td className="px-3 py-3">{money(position.markPrice)}</td>
                <td className="px-3 py-3">
                  {money(position.liqPrice ?? position.liquidationPrice)}
                </td>
                <td className="px-3 py-3">{position.leverage}x</td>
                <td className={`px-3 py-3 ${pnl < 0 ? "text-red-300" : "text-emerald-300"}`}>
                  {money(position.unrealisedPnl)}
                </td>
                <td className="px-3 py-3">
                  {(position.takeProfit || "-") + " / " + (position.stopLoss || "-")}
                </td>
                <td className="rounded-r-lg px-3 py-3">
                  <span className={`rounded-full border px-2 py-1 text-xs ${riskClass(level)}`}>
                    {riskLabel(level)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
