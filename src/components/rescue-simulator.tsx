"use client";

import { useMemo, useState } from "react";

import { money } from "@/lib/format";
import type { Position } from "@/lib/types";

type RescueSimulatorProps = {
  positions: Position[];
  wallet: string | null | undefined;
  initialGoal?: number;
};

export function RescueSimulator({
  positions,
  wallet,
  initialGoal = 5
}: RescueSimulatorProps) {
  const initialBtc = markFor(positions, "BTCUSDT", 64000);
  const initialEth = markFor(positions, "ETHUSDT", 1750);
  const [btc, setBtc] = useState(initialBtc);
  const [eth, setEth] = useState(initialEth);
  const [goal, setGoal] = useState(initialGoal);

  const projection = useMemo(() => {
    const walletNumber = Number(wallet || 0);
    const totalPnl = positions.reduce((sum, position) => {
      const mark = position.symbol === "BTCUSDT" ? btc : position.symbol === "ETHUSDT" ? eth : Number(position.markPrice || 0);
      return sum + projectedPnl(position, mark);
    }, 0);
    const equity = walletNumber + totalPnl;
    const target = walletNumber * (1 + goal / 100);
    const progress = target > 0 ? Math.min(100, Math.max(0, (equity / target) * 100)) : 0;
    return { walletNumber, totalPnl, equity, target, progress };
  }, [btc, eth, goal, positions, wallet]);

  const positive = projection.equity >= 0;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#10141b] p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-silver-500">
        Симулятор восстановления
      </div>
      <p className="mt-2 max-w-xl text-sm leading-6 text-silver-400">
        Двигай цены — капитал пересчитывается из текущих позиций. Так видно, при какой комбинации счёт выходит в плюс.
      </p>

      <div className={`mt-6 rounded-lg border p-5 ${positive ? "border-emerald-500/35 bg-emerald-500/[0.055]" : "border-gold-500/35 bg-gold-500/[0.055]"}`}>
        <div className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-silver-500">
          Капитал при этих ценах
        </div>
        <div className={`mt-2 text-center font-mono text-5xl font-bold ${positive ? "text-emerald-300" : "text-gold-300"}`}>
          {money(projection.equity)} USDT
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#1b2430]">
          <div
            className={`h-full rounded-full ${positive ? "bg-emerald-400" : "bg-gold-400"}`}
            style={{ width: `${projection.progress}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-silver-500">
          <span>до цели +{goal}% ({money(projection.target)})</span>
          <span className={positive ? "text-emerald-300" : "text-gold-300"}>
            {positive ? "в плюсе" : "ниже цели"}
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-5">
        <RescueSlider
          label="Цена BTC"
          value={btc}
          min={Math.max(1000, Math.round(initialBtc * 0.86))}
          max={Math.round(initialBtc * 1.22)}
          step={10}
          onChange={setBtc}
          hints={[
            "TP шорта",
            "ликв. шорта",
            "вход лонга"
          ]}
        />
        <RescueSlider
          label="Цена ETH"
          value={eth}
          min={Math.max(100, Math.round(initialEth * 0.86))}
          max={Math.round(initialEth * 1.18)}
          step={1}
          onChange={setEth}
          hints={[
            "вход шорта",
            "вход лонга",
            "TP лонга"
          ]}
        />
        <RescueSlider
          label="Цель по капиталу"
          value={goal}
          min={0}
          max={20}
          step={1}
          suffix="%"
          onChange={setGoal}
          hints={["0%", "+5%", "+20%"]}
        />
      </div>

      <div className="mt-6 border-t border-white/[0.07] pt-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-silver-500">
          PnL позиций при этих ценах
        </div>
        <div className="mt-3 grid gap-2">
          {positions.map((position) => {
            const mark = position.symbol === "BTCUSDT" ? btc : position.symbol === "ETHUSDT" ? eth : Number(position.markPrice || 0);
            const pnl = projectedPnl(position, mark);
            return (
              <div key={`${position.symbol}-${position.side}`} className="flex items-center justify-between gap-4 font-mono text-sm">
                <span className="text-silver-400">
                  {position.symbol} {position.side === "Buy" ? "L" : "S"}
                </span>
                <span className={pnl < 0 ? "text-red-300" : "text-emerald-300"}>
                  {money(pnl)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RescueSlider({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  hints,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  hints: string[];
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-3 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-silver-300">{label}</span>
        <span className="font-mono text-lg font-semibold text-gold-300">
          {money(value, suffix ? 0 : 2)}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full accent-[#5b8cff]"
      />
      <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-silver-600">
        {hints.map((hint) => (
          <span key={hint}>{hint}</span>
        ))}
      </div>
    </label>
  );
}

function markFor(positions: Position[], symbol: string, fallback: number): number {
  const position = positions.find((item) => item.symbol === symbol && Number(item.markPrice || 0) > 0);
  return Number(position?.markPrice || fallback);
}

function projectedPnl(position: Position, mark: number): number {
  const size = Number(position.size || 0);
  const entry = Number(position.avgPrice || 0);
  if (!size || !entry || !mark) return 0;
  if (position.side === "Sell") return (entry - mark) * size;
  return (mark - entry) * size;
}
