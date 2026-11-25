"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { money } from "@/lib/format";

// Live layer on top of the server-rendered snapshot.
// - Prices: Bybit public WebSocket (tickers), no API key involved.
// - Account (positions, wallet): the server snapshot is re-fetched in the
//   background by the dashboard, so it never silently goes stale.
// uPnL and equity are re-priced in the browser between snapshots:
//   equity_live = equity_snapshot + (uPnL_live − uPnL_snapshot).

export const ACCOUNT_REFRESH_MS = 15_000;
const FLUSH_MS = 250;
const PING_MS = 20_000;
const FRESH_MS = 5_000;
const STALE_MS = 30_000;

export type LivePosition = {
  symbol: string;
  side: string;
  size: number;
  entry: number;
  snapshotPnl: number;
};

/** `at` = when this browser received the tick (client clock). */
type Ticker = { last?: number; mark?: number; at: number };

type LiveState = {
  tickers: Record<string, Ticker>;
  /** Symbols whose prices are shown or priced into the account. */
  tracked: string[];
  connected: boolean;
  fetchedAt: number;
  /** When this browser received the current account snapshot (client clock). */
  snapshotAt: number;
  startedAt: number;
  now: number;
  positions: LivePosition[];
  snapshotEquity: number;
};

const CONNECT_GRACE_MS = 10_000;

const LiveContext = createContext<LiveState | null>(null);

export function LiveDataProvider({
  testnet,
  symbols,
  tracked,
  positions,
  snapshotEquity,
  fetchedAt,
  children
}: {
  testnet: boolean;
  symbols: string[];
  tracked: string[];
  positions: LivePosition[];
  snapshotEquity: number;
  fetchedAt: number;
  children: ReactNode;
}) {
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [connected, setConnected] = useState(false);
  // Start from the snapshot time so server and client render the same text;
  // the real clock takes over after mount.
  const [now, setNow] = useState(fetchedAt);
  const [startedAt, setStartedAt] = useState(fetchedAt);
  const [snapshotAt, setSnapshotAt] = useState(fetchedAt);
  useEffect(() => {
    setStartedAt(Date.now());
    setNow(Date.now());
  }, []);
  // Each refreshed snapshot supersedes marks received before it.
  useEffect(() => {
    setSnapshotAt(Date.now());
  }, [fetchedAt]);
  const buffer = useRef<Record<string, Ticker>>({});
  const dirty = useRef(false);
  const symbolsKey = symbols.join(",");
  const trackedKey = tracked.join(",");

  // Price stream with reconnect and keep-alive.
  useEffect(() => {
    const url = testnet
      ? "wss://stream-testnet.bybit.com/v5/public/linear"
      : "wss://stream.bybit.com/v5/public/linear";
    const subscribed = symbolsKey.split(",").filter(Boolean);
    let ws: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        ws?.send(JSON.stringify({ op: "subscribe", args: subscribed.map((s) => `tickers.${s}`) }));
        ping = setInterval(() => ws?.send(JSON.stringify({ op: "ping" })), PING_MS);
      };
      ws.onmessage = (event) => {
        let message: { topic?: string; data?: Record<string, string> };
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!message.topic?.startsWith("tickers.") || !message.data) return;
        const symbol = message.topic.slice("tickers.".length);
        const prev = buffer.current[symbol];
        const last = Number(message.data.lastPrice);
        const mark = Number(message.data.markPrice);
        buffer.current[symbol] = {
          last: Number.isFinite(last) && last > 0 ? last : prev?.last,
          mark: Number.isFinite(mark) && mark > 0 ? mark : prev?.mark,
          at: Date.now()
        };
        dirty.current = true;
      };
      ws.onclose = () => {
        clearInterval(ping);
        setConnected(false);
        if (closed) return;
        attempt += 1;
        retry = setTimeout(connect, Math.min(15_000, 1_000 * 2 ** Math.min(attempt, 4)));
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      closed = true;
      clearInterval(ping);
      clearTimeout(retry);
      ws?.close();
    };
  }, [testnet, symbolsKey]);

  // Batch ticks into at most 4 renders per second; also drives the age labels.
  useEffect(() => {
    const id = setInterval(() => {
      if (dirty.current) {
        dirty.current = false;
        setTickers({ ...buffer.current });
      }
      setNow(Date.now());
    }, FLUSH_MS);
    return () => clearInterval(id);
  }, []);

  const value = useMemo<LiveState>(
    () => ({
      tickers,
      tracked: trackedKey.split(",").filter(Boolean),
      connected,
      fetchedAt,
      snapshotAt,
      startedAt,
      now,
      positions,
      snapshotEquity
    }),
    [tickers, trackedKey, connected, fetchedAt, snapshotAt, startedAt, now, positions, snapshotEquity]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

function useLive(): LiveState | null {
  return useContext(LiveContext);
}

/**
 * A streamed price is used only while it is fresh and newer than the account
 * snapshot; otherwise the snapshot value wins (a dropped stream must not roll
 * fresh account numbers back to an old mark).
 */
function usablePrice(state: LiveState, symbol: string, field: "last" | "mark"): number | undefined {
  const ticker = state.tickers[symbol];
  const value = ticker?.[field];
  if (!ticker || !value) return undefined;
  if (ticker.at < state.snapshotAt) return undefined;
  if (state.now - ticker.at > STALE_MS) return undefined;
  return value;
}

/** Age of the oldest tracked price; null while any tracked symbol has no tick yet. */
function oldestPriceAge(state: LiveState): number | null {
  if (!state.tracked.length) return null;
  let oldest = 0;
  for (const symbol of state.tracked) {
    const ticker = state.tickers[symbol];
    if (!ticker) return null;
    oldest = Math.max(oldest, state.now - ticker.at);
  }
  return oldest;
}

function livePnl(state: LiveState): { pnl: number; equity: number; live: boolean } {
  let pnl = 0;
  let snapshot = 0;
  let live = false;
  for (const position of state.positions) {
    snapshot += position.snapshotPnl;
    const mark = usablePrice(state, position.symbol, "mark");
    if (mark && position.entry > 0) {
      const direction = position.side === "Sell" ? -1 : 1;
      pnl += direction * position.size * (mark - position.entry);
      live = true;
    } else {
      pnl += position.snapshotPnl;
    }
  }
  return { pnl, equity: state.snapshotEquity + (pnl - snapshot), live };
}

function ageTone(ageMs: number | null): string {
  if (ageMs === null || ageMs > STALE_MS) return "text-red-300";
  if (ageMs > FRESH_MS) return "text-gold-300";
  return "text-emerald-300";
}

function ageDot(ageMs: number | null): string {
  if (ageMs === null || ageMs > STALE_MS) return "bg-red-400";
  if (ageMs > FRESH_MS) return "bg-gold-400";
  return "bg-emerald-400";
}

function formatAge(ageMs: number): string {
  const seconds = Math.max(0, ageMs) / 1000;
  if (seconds < 10) return `${seconds.toFixed(1).replace(".", ",")} с`;
  if (seconds < 90) return `${Math.round(seconds)} с`;
  return `${Math.round(seconds / 60)} мин`;
}

export function LivePrice({ symbol, fallback }: { symbol: string; fallback: string | number }) {
  const state = useLive();
  const last = state ? usablePrice(state, symbol, "last") : undefined;
  return <>{money(last ?? fallback)}</>;
}

/** Equity / uPnL re-priced from live marks; falls back to the snapshot value. */
export function LiveAccountValue({
  kind,
  fallback,
  suffix = "",
  className = "",
  toneClasses
}: {
  kind: "equity" | "pnl";
  fallback: number;
  suffix?: string;
  className?: string;
  toneClasses?: { positive: string; negative: string };
}) {
  const state = useLive();
  const value = state ? livePnl(state)[kind] : fallback;
  const tone = toneClasses ? (value < 0 ? toneClasses.negative : toneClasses.positive) : "";
  return (
    <span className={`${className} ${tone}`.trim()}>
      {money(value)}
      {suffix}
    </span>
  );
}

/** Replaces the static "сейчас": shows how old the price and the account data are. */
export function LiveFreshness() {
  const state = useLive();
  if (!state) return null;
  const priceAge = oldestPriceAge(state);
  const accountAge = state.now - state.fetchedAt;
  const starting = state.now - state.startedAt < CONNECT_GRACE_MS;
  const waiting = !state.connected || priceAge === null;
  const priceText = waiting
    ? starting
      ? "цены: подключение"
      : "цены: переподключение"
    : `цены ${formatAge(priceAge)}`;
  // While connecting, show amber instead of red.
  const priceToneAge = waiting ? (starting ? FRESH_MS + 1 : null) : priceAge;

  return (
    <div className="flex flex-wrap items-center gap-3 font-mono text-[10.5px]" role="status" aria-live="off">
      <span className={`inline-flex items-center gap-1.5 ${ageTone(priceToneAge)}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${ageDot(priceToneAge)}`} />
        {priceText}
      </span>
      <span className={`inline-flex items-center gap-1.5 ${ageTone(accountAge > ACCOUNT_REFRESH_MS * 2 ? accountAge : 0)}`}>
        счёт {formatAge(accountAge)} назад
      </span>
    </div>
  );
}

export function StaleBanner() {
  const state = useLive();
  if (!state) return null;
  if (state.now - state.startedAt < CONNECT_GRACE_MS) return null;
  const accountAge = state.now - state.fetchedAt;
  const priceAge = oldestPriceAge(state);
  const priceDown = !state.connected || priceAge === null || priceAge > STALE_MS;
  const accountDown = accountAge > ACCOUNT_REFRESH_MS * 4;
  if (!priceDown && !accountDown) return null;
  const what = [priceDown ? "цен" : null, accountDown ? "счёта" : null].filter(Boolean).join(" и ");
  return (
    <div role="status" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      Нет свежих данных {what}. Цифры ниже могут быть устаревшими — идёт переподключение.
    </div>
  );
}
