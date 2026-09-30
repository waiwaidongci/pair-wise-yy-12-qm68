import React, { useState } from "react";
import { useStore } from "../StoreContext";
import { selectReminders, fmtDate } from "../store";
import { StatusBadge } from "./ui";

const TONE: Record<string, string> = {
  gray: "#64748b",
  blue: "#2563eb",
  red: "#dc2626",
  amber: "#d97706",
  green: "#166534",
};

export function Reminders({ onSelect }: { onSelect: (orderId: string) => void }) {
  const { state } = useStore();
  const [now] = useState(() => Date.now());
  const reminders = selectReminders(state, now);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>复查提醒</p>
          <h2>待办提醒</h2>
        </div>
        <span className="muted">{reminders.length} 项</span>
      </div>
      {reminders.length === 0 ? (
        <div className="empty">暂无待办，所有马匹状态良好</div>
      ) : (
        <div className="reminder-list">
          {reminders.map((r) => (
            <article
              key={r.key}
              className="reminder-card"
              style={{ borderLeftColor: TONE[r.tone] }}
              onClick={() => onSelect(r.orderId)}
            >
              <div>
                <h3>{r.title}</h3>
                <p>{r.detail}</p>
              </div>
              <button className="link-btn">处理 →</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function History() {
  const { state } = useStore();
  const history = state.orders
    .filter((o) => o.status === "closed")
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>蹄铁更换历史</p>
          <h2>履历</h2>
        </div>
      </div>
      {history.length === 0 ? (
        <div className="empty">暂无已结束的适配单</div>
      ) : (
        <div className="history-list">
          {history.map((o) => {
            const horse = state.horses.find((h) => h.id === o.horseId);
            return (
              <article key={o.id} className="history-card">
                <div className="history-head">
                  <b>{horse?.id}</b>
                  <div>
                    <h3>{horse?.name}</h3>
                    <p className="muted">
                      适配单 {o.id} · {fmtDate(o.createdAt)} 至 {fmtDate(o.closedAt)}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
                <div className="history-hooves">
                  {(["LF", "RF", "LH", "RH"] as const).map((k) => (
                    <span key={k}>
                      {k === "LF" ? "左前" : k === "RF" ? "右前" : k === "LH" ? "左后" : "右后"}
                      ：{o.hooves[k].size}mm / {o.hooves[k].nailPosition}
                    </span>
                  ))}
                </div>
                <p className="muted">
                  复查日 {fmtDate(o.recheckDate)} · 试装 {o.trialFitterName} · 确认{" "}
                  {o.confirmations.map((c) => c.confirmerName).join("、")}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function Inventory() {
  const { state } = useStore();
  const locked = state.shoes.filter((s) => s.lockedBy);
  const free = state.shoes.filter((s) => !s.lockedBy);
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>库存蹄铁</p>
          <h2>蹄铁台账</h2>
        </div>
        <span className="muted">
          可用 {free.length} · 已锁定 {locked.length}
        </span>
      </div>
      <div className="shoe-inventory">
        {state.shoes.map((s) => {
          const order = s.lockedBy ? state.orders.find((o) => o.id === s.lockedBy) : null;
          const horse = order ? state.horses.find((h) => h.id === order.horseId) : null;
          return (
            <span key={s.id} className={`shoe-chip ${s.lockedBy ? "locked" : ""}`}>
              {s.id} · {s.size}mm {s.type}
              {s.lockedBy && <em>→ {horse?.id ?? s.lockedBy}</em>}
            </span>
          );
        })}
      </div>
    </section>
  );
}
