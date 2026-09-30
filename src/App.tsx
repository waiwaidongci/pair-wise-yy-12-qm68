import { useMemo, useState } from "react";
import "./styles.css";
import { StoreProvider, useStore } from "./store";
import { daysBetween, isActive, todayISO } from "./domain";
import { OrdersPage } from "./components/OrdersPage";
import { RemindersPage } from "./components/RemindersPage";
import { PortfolioPage } from "./components/PortfolioPage";
import { StockHistoryPage } from "./components/StockHistoryPage";

type Tab = "orders" | "reminders" | "portfolio" | "stock";

const TABS: { key: Tab; label: string }[] = [
  { key: "orders", label: "适配单" },
  { key: "reminders", label: "复查提醒" },
  { key: "portfolio", label: "马匹档案" },
  { key: "stock", label: "库存与履历" },
];

function Metrics() {
  const { state } = useStore();
  const today = todayISO();
  const metrics = useMemo(() => {
    const pendingReview = state.orders.filter(
      (o) => o.status === "released" && o.reviewDueAt && daysBetween(today, o.reviewDueAt) <= 7
    ).length;
    const abnormal = state.orders.filter(
      (o) =>
        isActive(o) &&
        (Object.values(o.hooves).some((h) => h.gait === "mild" || h.gait === "severe"))
    ).length;
    const locked = state.orders
      .filter(isActive)
      .reduce((n, o) => n + o.allocations.length, 0);
    const horses = state.horses.length;
    return [
      { label: "7日内待复查", value: pendingReview, tone: "m-green" },
      { label: "异常步态在档", value: abnormal, tone: "m-amber" },
      { label: "蹄铁锁定中", value: locked, tone: "m-blue" },
      { label: "马匹档案", value: horses, tone: "m-brown" },
    ];
  }, [state, today]);

  return (
    <section className="metrics">
      {metrics.map((m) => (
        <article key={m.label} className={m.tone}>
          <small>{m.label}</small>
          <strong>{m.value}</strong>
        </article>
      ))}
    </section>
  );
}

function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>("orders");

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">四蹄适配 · 复查放行工作台</p>
          <h1>马术蹄铁修整档案</h1>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? "tab tab-on" : "tab"}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <Metrics />

      {tab === "orders" && <OrdersPage />}
      {tab === "reminders" && <RemindersPage />}
      {tab === "portfolio" && <PortfolioPage />}
      {tab === "stock" && <StockHistoryPage />}

      <footer className="foot">
        规则：一匹马至多一张未结束适配单 · 四蹄尺寸/步态/钉位齐全才能领料 · 领出即锁，重复并发只留先到 ·
        尺寸差超 2mm 停待备料 · 换人连续两次稳定才放行 · 改蹄记录即作废放行并重算复查日
      </footer>

      <Toasts />
    </main>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
