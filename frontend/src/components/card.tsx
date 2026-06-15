import type { ReactNode } from "react";

type CardProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function Card({ title, children, className = "" }: CardProps) {
  return (
    <section
      className={`rounded-lg border border-white/10 bg-graphite-850/80 p-5 shadow-gold-soft ${className}`}
    >
      {title ? (
        <div className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">
          {title}
        </div>
      ) : null}
      {children}
    </section>
  );
}
