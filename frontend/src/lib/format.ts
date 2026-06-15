import type { RiskLevel } from "./types";

export function money(
  value: string | number | null | undefined,
  digits = 2
): string {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function compact(value: string | number | null | undefined): string {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function riskClass(level: RiskLevel | string): string {
  switch (level) {
    case "low":
      return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
    case "medium":
      return "text-yellow-300 border-yellow-500/30 bg-yellow-500/10";
    case "high":
      return "text-orange-300 border-orange-500/30 bg-orange-500/10";
    case "critical":
      return "text-red-300 border-red-500/30 bg-red-500/10";
    default:
      return "text-silver-400 border-white/10 bg-white/5";
  }
}
