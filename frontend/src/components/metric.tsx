type MetricProps = {
  label: string;
  value: string;
  tone?: "default" | "gold" | "red" | "green";
};

const toneClass = {
  default: "text-silver-400",
  gold: "text-gold-400",
  red: "text-red-300",
  green: "text-emerald-300"
};

export function Metric({ label, value, tone = "default" }: MetricProps) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-[0.14em] text-silver-500">
        {label}
      </div>
      <div className={`mt-1 truncate text-2xl font-semibold ${toneClass[tone]}`}>
        {value}
      </div>
    </div>
  );
}
