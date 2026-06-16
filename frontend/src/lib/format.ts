import type { RiskLevel } from "./types";
import type { TrendAlignment, TrendDirection } from "./types";

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

export function riskLabel(level: RiskLevel | string): string {
  switch (level) {
    case "low":
      return "Низкий";
    case "medium":
      return "Средний";
    case "high":
      return "Высокий";
    case "critical":
      return "Критический";
    default:
      return String(level || "-");
  }
}

export function sideLabel(side: string | null | undefined): string {
  if (side === "Buy") return "Лонг";
  if (side === "Sell") return "Шорт";
  return "-";
}

export function averagingScenarioLabel(name: string): string {
  switch (name) {
    case "small_add_10_percent":
      return "Добавить 10% позиции";
    case "medium_add_25_percent":
      return "Добавить 25% позиции";
    case "large_add_50_percent":
      return "Добавить 50% позиции";
    default:
      return name.replaceAll("_", " ");
  }
}

export function targetAverageLabel(key: string): string {
  switch (key) {
    case "target_avg_price":
      return "Целевая средняя";
    case "required_add_qty":
      return "Нужно добавить";
    case "estimated_cost":
      return "Стоимость";
    case "new_total_qty":
      return "Новый размер";
    case "required_rebound_percent":
      return "Нужный отскок";
    case "risk_level":
      return "Риск";
    default:
      return key.replaceAll("_", " ");
  }
}

export function translateStatus(message: string): string {
  if (message === "Rescue plan calculated.") return "План спасения рассчитан.";
  return message;
}

export function translateWarning(warning: string): string {
  const highLeverage = warning.match(/^High leverage detected: (.+)$/);
  if (highLeverage) return `Высокое плечо: ${highLeverage[1]}`;

  const loss = warning.match(/^Loss is more than (.+) of balance\.$/);
  if (loss) return `Убыток больше ${loss[1]} от баланса.`;

  const drawdown = warning.match(/^Drawdown is high: (.+)\.$/);
  if (drawdown) return `Просадка высокая: ${drawdown[1]}.`;

  switch (warning) {
    case "Averaging is dangerous at this leverage.":
      return "Усреднение опасно при таком плече.";
    case "CRITICAL RISK: Do not average blindly. Reduce risk first.":
      return "КРИТИЧЕСКИЙ РИСК: не усредняйся вслепую. Сначала снизь риск.";
    default:
      return warning;
  }
}

export function trendDirectionLabel(direction: TrendDirection | string): string {
  switch (direction) {
    case "up":
      return "Вверх";
    case "down":
      return "Вниз";
    case "sideways":
      return "Боковик";
    case "mixed":
      return "Смешанный";
    default:
      return "-";
  }
}

export function trendAlignmentLabel(alignment: TrendAlignment | string): string {
  switch (alignment) {
    case "with_position":
      return "За позицию";
    case "against_position":
      return "Против позиции";
    case "neutral":
      return "Нейтрально";
    default:
      return "-";
  }
}

export function trendTone(alignment: TrendAlignment | string): "green" | "red" | "gold" {
  if (alignment === "with_position") return "green";
  if (alignment === "against_position") return "red";
  return "gold";
}
