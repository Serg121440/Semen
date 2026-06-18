const criticalCss = `
  :root {
    color-scheme: dark;
    --bg: #080a0d;
    --panel: rgba(18, 22, 28, 0.88);
    --panel-soft: rgba(255, 255, 255, 0.045);
    --line: rgba(255, 255, 255, 0.11);
    --text: #f6f7fb;
    --muted: #9aa6b2;
    --gold: #e8c875;
    --green: #6ee7b7;
    --red: #fca5a5;
    --blue: #60a5fa;
  }

  html {
    background: var(--bg);
  }

  body {
    margin: 0;
    min-height: 100vh;
    background:
      linear-gradient(180deg, #080a0d 0%, #10151c 46%, #090b0f 100%);
    color: var(--text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  button,
  input,
  select {
    font: inherit;
  }

  main,
  .dashboard-shell {
    width: min(1440px, 100%);
    min-height: 100vh;
    margin: 0 auto;
    padding: 20px 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  header,
  .dashboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(12, 16, 22, 0.86);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(18px);
  }

  h1 {
    margin: 6px 0 0;
    font-size: clamp(30px, 3.2vw, 46px);
    line-height: 1.05;
    font-weight: 760;
    color: #fff;
  }

  h2 {
    margin: 0;
    color: #fff;
  }

  nav,
  .dashboard-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.045);
  }

  nav a {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    border-radius: 9px;
    padding: 0 14px;
    color: var(--muted);
    font-size: 14px;
    font-weight: 700;
  }

  nav a:first-child,
  nav a:hover {
    background: rgba(232, 200, 117, 0.13);
    color: var(--gold);
  }

  .dashboard-header-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(120px, 1fr));
    gap: 8px;
  }

  .dashboard-stat-chip {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.045);
    padding: 9px 11px;
  }

  .dashboard-metrics,
  .dashboard-positions {
    display: grid;
    gap: 14px;
  }

  .dashboard-metrics {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .dashboard-positions {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .dashboard-content-grid,
  .scenario-dashboard,
  .scenario-lab {
    display: grid;
    gap: 16px;
    grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
    align-items: start;
  }

  .scenario-chart-card,
  .scenario-zones,
  .scenario-card {
    border-radius: 12px;
  }

  .scenario-chart-frame svg {
    max-height: 360px;
  }

  .scenario-side {
    align-content: start;
  }

  .scenario-card {
    min-height: 0;
  }

  .crypto-topbar {
    background: rgba(17, 21, 29, 0.96);
  }

  .scenario-panel,
  .scenario-heatmap,
  .scenario-trades > div > div,
  .scenario-zones {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: #11151d;
    box-shadow: 0 18px 55px rgba(0, 0, 0, 0.22);
  }

  .scenario-panel,
  .scenario-heatmap {
    padding: 20px;
  }

  .scenario-chart-frame {
    min-width: 0;
    background: #080a0e;
  }

  .scenario-lab > .scenario-heatmap,
  .scenario-lab > .scenario-trades {
    min-width: 0;
  }

  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  }

  main > section {
    min-width: 0;
  }

  main > section:nth-of-type(1) {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  main > section:nth-of-type(2) {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  main > section:nth-of-type(3),
  main > section:nth-of-type(4),
  main > section:nth-of-type(5) {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
    gap: 16px;
  }

  section[class*="rounded"],
  div[class*="rounded-lg"],
  a[class*="rounded-lg"] {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel);
    box-shadow: 0 18px 55px rgba(0, 0, 0, 0.22);
  }

  section[class*="rounded"] {
    padding: 18px;
  }

  a[class*="rounded-lg"] {
    display: block;
    padding: 16px;
    transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
  }

  a[class*="rounded-lg"]:hover {
    transform: translateY(-1px);
    border-color: rgba(232, 200, 117, 0.34);
    background: rgba(255, 255, 255, 0.07);
  }

  [class*="text-xs"][class*="uppercase"],
  [class*="tracking"] {
    color: var(--muted);
    font-size: 12px;
    font-weight: 760;
    text-transform: uppercase;
  }

  [class*="text-2xl"],
  [class*="text-4xl"] {
    color: var(--text);
    font-weight: 760;
  }

  [class*="text-gold"] { color: var(--gold) !important; }
  [class*="text-red"] { color: var(--red) !important; }
  [class*="text-emerald"] { color: var(--green) !important; }
  [class*="text-silver"] { color: var(--muted) !important; }
  [class*="text-white"] { color: #fff !important; }

  [class*="bg-red"] {
    background: rgba(244, 63, 94, 0.12) !important;
    border-color: rgba(244, 63, 94, 0.28) !important;
  }

  [class*="bg-emerald"] {
    background: rgba(16, 185, 129, 0.12) !important;
    border-color: rgba(16, 185, 129, 0.28) !important;
  }

  [class*="bg-gold"] {
    background: rgba(232, 200, 117, 0.13) !important;
    border-color: rgba(232, 200, 117, 0.3) !important;
  }

  span[class*="rounded-full"],
  div[class*="inline-flex"][class*="rounded-full"] {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    border-radius: 999px;
    border: 1px solid var(--line);
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }

  svg {
    display: inline-block;
    vertical-align: middle;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 8px;
  }

  th {
    color: var(--muted);
    font-size: 12px;
    text-align: left;
    text-transform: uppercase;
  }

  td {
    padding: 12px;
    background: rgba(255, 255, 255, 0.045);
  }

  @media (max-width: 1100px) {
    .dashboard-metrics,
    .dashboard-positions,
    .dashboard-content-grid,
    .scenario-dashboard,
    .scenario-lab {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dashboard-header-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    main > section:nth-of-type(1),
    main > section:nth-of-type(2),
    main > section:nth-of-type(3),
    main > section:nth-of-type(4),
    main > section:nth-of-type(5) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    main,
    .dashboard-shell {
      padding: 12px;
      gap: 12px;
    }

    header,
    .dashboard-header,
    .dashboard-metrics,
    .dashboard-positions,
    .dashboard-content-grid,
    .scenario-dashboard,
    .scenario-lab,
    .dashboard-header-stats,
    main > section:nth-of-type(1),
    main > section:nth-of-type(2),
    main > section:nth-of-type(3),
    main > section:nth-of-type(4),
    main > section:nth-of-type(5) {
      grid-template-columns: 1fr;
      flex-direction: column;
      align-items: stretch;
    }

    .scenario-chart-frame svg {
      max-height: 300px;
    }
  }
`;

export function CriticalStyles() {
  return <style dangerouslySetInnerHTML={{ __html: criticalCss }} />;
}
