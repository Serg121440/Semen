import { riskClass } from "@/lib/format";
import type { RiskLevel } from "@/lib/types";

type StatusPillProps = {
  label: string;
  level?: RiskLevel | string;
};

export function StatusPill({ label, level = "low" }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase ${riskClass(
        level
      )}`}
    >
      {label}
    </span>
  );
}
