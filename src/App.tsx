import React, { useMemo, useState } from "react";
import { StoreProvider, useStore } from "./StoreContext";
import { HorseList } from "./components/HorseList";
import { OrderDetail } from "./components/OrderDetail";
import { Reminders, History, Inventory } from "./components/Reminders";
import { Toast } from "./components/ui";
import { selectReminders } from "./store";

type Tab = "orders" | "reminders" | "history" | "inventory";

function Shell() {
  const { state } = useStore();
  const [tab, setTab] = useState<Tab>("orders");
  const [selectedId, setSelectedId] = useState<string | null>(
    state.orders.find((o) => o.status !== "closed")?.id ?? null
  );
  const [now] = useState(() => Date.now());

  const selected = state.orders.find((o) => o.id === selectedId) ?? null;
  const reminders = useMemo(() => selectReminders(state, now), [state, now]);

  const openCount = state.orders.filter((o) => o.status !== "closed").length;
  const waitingCount = state.orders.filter((o) => o.status === "waiting_material").length;
  const confirmCount = state.orders.filter((o) => o.status === "trial_fitting").length;
  const recheckCount = reminders.filter((r) => r.kind === "recheck").length;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "orders", label: "马匹与适配单" },
    { key: "reminders", label: "复查提醒", badge: reminders.length },
    { key: "history", label: "蹄铁履历" },
    { key: "inventory", label: "蹄铁库存" },
  ];

  return (
    <main className="app">
      <section className="hero">
        <p>马术蹄铁修整档案 · 四蹄适配与复查放行</p>
        <h1>蹄铁适配台账</h1>
        <span>
          一匹马最多留一张未结束适配单；四蹄尺寸、步态等级、钉位齐全后才能领料。库存蹄铁领出即锁定，
          重复或并发领用只留先到的；尺寸差超过 2mm 停待备料。试装后换人连续两次确认步态稳定方可放行，
          修改任一蹄记录即放行失效并重算复查日。列表、提醒、履历共用同一状态。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>在办适配单</small>
          <strong>{openCount}</strong>
        </article>
        <article>
          <small>待备料</small>
          <strong>{waitingCount}</strong>
        </article>
        <article>
          <small>待换人确认</small>
          <strong>{confirmCount}</strong>
        </article>
        <article>
          <small>待复查</small>
          <strong>{recheckCount}</strong>
        </article>
      </section>

      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && <em className="tab-badge">{t.badge}</em>}
          </button>
        ))}
      </nav>

      {tab === "orders" && (
        <div className="workspace">
          <HorseList
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
            }}
          />
          {selected ? (
            <OrderDetail order={selected} />
          ) : (
            <section className="panel">
              <div className="empty">请选择或新建一张适配单</div>
            </section>
          )}
        </div>
      )}

      {tab === "reminders" && (
        <Reminders
          onSelect={(id) => {
            setSelectedId(id);
            setTab("orders");
          }}
        />
      )}

      {tab === "history" && <History />}

      {tab === "inventory" && <Inventory />}

      <Toast toast={state.toast} />
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
