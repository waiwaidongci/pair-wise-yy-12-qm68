import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { FittingOrder } from "../types";
import {
  completeHooves,
  daysBetween,
  HOOF_IDS,
  HOOF_LABEL,
  isFourHoovesComplete,
  todayISO,
} from "../domain";
import { GaitBadge, StatusBadge } from "./ui";
import { OrderDetail } from "./OrderDetail";
import { NewOrderModal } from "./NewOrderModal";

type Scope = "active" | "closed";

const STATUS_FILTERS: { key: string; label: string; match: (o: FittingOrder) => boolean }[] = [
  { key: "all", label: "全部", match: () => true },
  { key: "recording", label: "建档中", match: (o) => o.status === "recording" },
  { key: "ready", label: "待领料", match: (o) => o.status === "ready" || o.status === "awaitingStock" },
  { key: "fitting", label: "试装确认", match: (o) => ["allocated", "fitting", "releaseVoid"].includes(o.status) },
  { key: "released", label: "待复查", match: (o) => o.status === "released" },
];

function OrderCard({ order, onOpen }: { order: FittingOrder; onOpen: () => void }) {
  const { state } = useStore();
  const horse = state.horses.find((h) => h.id === order.horseId);
  const complete = completeHooves(order).length;
  const today = todayISO();
  const overdue = order.reviewDueAt ? daysBetween(today, order.reviewDueAt) < 0 : false;
  const inFlight = !!state.requisitionInFlight[order.id];

  return (
    <article className={`order-card ${inFlight ? "loading" : ""}`} onClick={onOpen}>
      <div className="order-card-head">
        <div>
          <h3>
            {order.id} <span className="horse-id">{order.horseId}</span>
          </h3>
          <small>
            {horse?.category ?? "未分类"} · 蹄铁师 {order.farrier} · 建档 {order.createdAt}
          </small>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="mini-hooves">
        {HOOF_IDS.map((id) => {
          const h = order.hooves[id];
          return (
            <div key={id} className="mini-hoof">
              <span>{HOOF_LABEL[id]}</span>
              {h.sizeMm === "" ? (
                <em className="hint">未量</em>
              ) : (
                <b>{h.sizeMm}mm</b>
              )}
              <GaitBadge gait={h.gait} />
              <small>{h.nailPositions ? h.nailPositions : "钉位未登"}</small>
            </div>
          );
        })}
      </div>

      <div className="order-card-foot">
        <span className={complete === 4 ? "tag tag-green" : "tag tag-amber"}>
          四蹄 {complete}/4
        </span>
        {order.allocations.length > 0 && (
          <span className="tag tag-amber">锁定蹄铁 {order.allocations.length}/4</span>
        )}
        {order.status === "awaitingStock" && (
          <span className="tag tag-red" title={order.stockReason}>
            停待备料
          </span>
        )}
        {(order.status === "fitting" || order.status === "allocated" || order.status === "releaseVoid") && (
          <span className="tag tag-blue">
            步态确认 {order.confirmations.length}/2{order.trialAt ? "" : " · 未试装"}
          </span>
        )}
        {order.reviewDueAt && (
          <span className={`tag ${overdue ? "tag-red" : "tag-green"}`}>
            复查 {order.reviewDueAt}
            {overdue ? "（逾期）" : ""}
          </span>
        )}
        {inFlight && <span className="tag tag-blue">领用锁定中…</span>}
      </div>
    </article>
  );
}

export function OrdersPage() {
  const { state, requisitionConcurrent } = useStore();
  const [scope, setScope] = useState<Scope>("active");
  const [statusKey, setStatusKey] = useState("all");
  const [cat, setCat] = useState<"全部" | "运动马" | "休养马">("全部");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const readyForConcurrent = useMemo(
    () =>
      state.orders.filter(
        (o) =>
          ["ready", "awaitingStock"].includes(o.status) && isFourHoovesComplete(o)
      ),
    [state.orders]
  );

  const statusFilter = STATUS_FILTERS.find((f) => f.key === statusKey) ?? STATUS_FILTERS[0];

  const list = state.orders
    .filter((o) => {
      const active =
        o.status !== "completed" && o.status !== "terminated";
      return scope === "active" ? active : !active;
    })
    .filter((o) => statusFilter.match(o))
    .filter((o) => {
      if (cat === "全部") return true;
      return state.horses.find((h) => h.id === o.horseId)?.category === cat;
    })
    .filter((o) => {
      const kw = q.trim().toUpperCase();
      if (!kw) return true;
      return (
        o.id.toUpperCase().includes(kw) ||
        o.horseId.toUpperCase().includes(kw) ||
        o.farrier.toUpperCase().includes(kw)
      );
    });

  const openOrder = openId ? state.orders.find((o) => o.id === openId) : null;

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="seg">
          <button className={scope === "active" ? "seg-on" : ""} onClick={() => setScope("active")}>
            未结束适配单
          </button>
          <button className={scope === "closed" ? "seg-on" : ""} onClick={() => setScope("closed")}>
            已结束
          </button>
        </div>
        <div className="chips">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              className={statusKey === f.key ? "chip-on" : ""}
              onClick={() => setStatusKey(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <input
            className="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜单号 / 马号 / 蹄铁师"
          />
          <select value={cat} onChange={(e) => setCat(e.target.value as typeof cat)}>
            <option value="全部">全部分类</option>
            <option value="运动马">运动马</option>
            <option value="休养马">休养马</option>
          </select>
          <button className="primary" onClick={() => setCreating(true)}>
            + 新建适配单
          </button>
        </div>
      </div>

      {scope === "active" && readyForConcurrent.length >= 2 && (
        <div className="concurrent-bar">
          <span>
            当前有 <b>{readyForConcurrent.length}</b> 张四蹄齐全、可领用的单：
            {readyForConcurrent.map((o) => o.id).join("、")}
          </span>
          <button
            className="primary"
            onClick={() => requisitionConcurrent(readyForConcurrent.map((o) => o.id))}
          >
            同时发出领用（并发抢领演示）
          </button>
          <span className="hint">同一批请求在提交瞬间原子判定，重复 / 并发只成先到的一笔</span>
        </div>
      )}

      <div className="order-grid">
        {list.map((o) => (
          <OrderCard key={o.id} order={o} onOpen={() => setOpenId(o.id)} />
        ))}
        {list.length === 0 && <p className="empty">没有符合条件的适配单</p>}
      </div>

      {openOrder && <OrderDetail order={openOrder} onClose={() => setOpenId(null)} />}
      {creating && <NewOrderModal onClose={() => setCreating(false)} />}
    </div>
  );
}
