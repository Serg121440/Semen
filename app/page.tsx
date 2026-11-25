import { DashboardView } from "@/components/dashboard-view";
import { loadDashboard } from "@/lib/api";

// Rendered per request: the dashboard reads live account state, and prerendering
// it at build time would hit the backend before it is reachable.
export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = (await searchParams) ?? {};
  const requestedSymbol = firstParam(params.symbol) ?? "BTCUSDT";
  const requestedSide = firstParam(params.side);
  const data = await loadDashboard(requestedSymbol, requestedSide);
  return <DashboardView key={JSON.stringify([requestedSymbol, requestedSide])} initialData={data} />;
}


function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
