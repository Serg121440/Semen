"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

const tabs = {
  overview: "Обзор",
  positions: "Позиции",
  analysis: "Анализ",
  rescue: "Спасение"
};

type View = keyof typeof tabs;

function useView(): View {
  const view = useSearchParams().get("view");
  return view && Object.hasOwn(tabs, view) ? view as View : "overview";
}

export function DashboardTabs({ freshness }: { freshness: ReactNode }) {
  const view = useView();
  const params = useSearchParams();

  return (
    <div role="navigation" aria-label="Разделы терминала" className="flex items-center gap-0 border-b border-white/[0.06] bg-[#0c0e14]/50 px-5">
      {Object.entries(tabs).map(([key, label]) => {
        const query = new URLSearchParams(params.toString());
        query.set("view", key);
        const href = `/?${query}`;
        return (
          <a
            key={key}
            href={href}
            aria-current={view === key ? "page" : undefined}
            className={`relative px-5 py-3 text-sm font-semibold transition ${view === key ? "text-white" : "text-[#7f8a99] hover:text-silver-300"}`}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              if (view !== key) window.history.pushState(null, "", href + window.location.hash);
            }}
          >
            {label}
            {view === key && <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-[#5b8cff]" />}
          </a>
        );
      })}
      <div className="flex-1" />
      {freshness}
    </div>
  );
}

export function DashboardPanels({ panels }: { panels: Record<View, ReactNode> }) {
  return panels[useView()];
}

export function DashboardSymbolLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const view = useView();
  const query = new URLSearchParams(href.split("?")[1]);
  query.set("view", view);
  return <Link {...props} href={`/?${query}`} />;
}
