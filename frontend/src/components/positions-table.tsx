import { compact, money, riskClass } from "@/lib/format";
import type { Position, RescuePlan } from "@/lib/types";

type PositionsTableProps = {
  positions: Position[];
  rescue: RescuePlan | null;
};

export function PositionsTable({ positions, rescue }: PositionsTableProps) {
  const active = positions.filter((position) => Number(position.size) > 0);

  if (active.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 text-sm text-silver-500">
        No open positions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] border-separate border-spacing-y-2 text-sm">
        <thead className="text-left text-xs uppercase tracking-[0.14em] text-silver-500">
          <tr>
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Side</th>
            <th className="px-3 py-2">Size</th>
            <th className="px-3 py-2">Avg Entry</th>
            <th className="px-3 py-2">Mark</th>
            <th className="px-3 py-2">Liq</th>
            <th className="px-3 py-2">Lev</th>
            <th className="px-3 py-2">uPnL</th>
            <th className="px-3 py-2">TP / SL</th>
            <th className="px-3 py-2">Risk</th>
          </tr>
        </thead>
        <tbody>
          {active.map((position) => {
            const leverage = Number(position.leverage || 0);
            const pnl = Number(position.unrealisedPnl || 0);
            const level =
              rescue && rescue.symbol === position.symbol
                ? rescue.risk_level
                : leverage >= 50
                  ? "high"
                  : "low";

            return (
              <tr
                key={position.symbol}
                className="rounded-lg bg-white/[0.035] text-silver-400"
              >
                <td className="rounded-l-lg px-3 py-3 font-semibold text-white">
                  {position.symbol}
                </td>
                <td className="px-3 py-3">{position.side === "Buy" ? "Long" : "Short"}</td>
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
                    {String(level).toUpperCase()}
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
