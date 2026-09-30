import { useState } from "react";
import { useStore } from "../store";
import { daysBetween, todayISO } from "../domain";
import { StatusBadge } from "./ui";
import { OrderDetail } from "./OrderDetail";

export function RemindersPage() {
  const { state } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayISO();

  const reviewRows = state.orders
    .filter((o) => o.status === "released")
    .map((o) => ({ order: o, d: daysBetween(today, o.reviewDueAt!) }))
    .sort((a, b) => a.d - b.d);

  const overdue = reviewRows.filter((r) => r.d < 0);
  const soon = reviewRows.filter((r) => r.d >= 0 && r.d <= 7);
  const later = reviewRows.filter((r) => r.d > 7);

  const awaiting = state.orders.filter((o) => o.status === "awaitingStock");
  const needConfirm = state.orders.filter(
    (o) =>
      (o.status === "allocated" && o.trialAt) ||
      o.status === "fitting" ||
      (o.status === "releaseVoid" && o.trialAt)
  );
  const needTrial = state.orders.filter(
    (o) => ["allocated", "releaseVoid"].includes(o.status) && !o.trialAt
  );

  const openOrder = openId ? state.orders.find((o) => o.id === openId) : null;

  const Row = ({ id, horseId, extra, tone }: { id: string; horseId: string; extra: string; tone: string }) => (
    <button className={`reminder-row ${tone}`} onClick={() => setOpenId(id)}>
      <b>{id}</b>
      <span>{horseId}</span>
      <span className="grow">{extra}</span>
      <span className="chev">›</span>
    </button>
  );

  return (
    <div className="page reminder-columns">
      <section className="panel">
        <h2>复查提醒</h2>
        <h3 className="reminder-h red">已逾期 {overdue.length}</h3>
        {overdue.map((r) => (
          <Row
            key={r.order.id}
            id={r.order.id}
            horseId={r.order.horseId}
            tone="tone-red"
            extra={`复查日 ${r.order.reviewDueAt}，已逾期 ${-r.d} 天`}
          />
        ))}
        {overdue.length === 0 && <p className="empty">无逾期</p>}

        <h3 className="reminder-h amber">7 天内到期 {soon.length}</h3>
        {soon.map((r) => (
          <Row
            key={r.order.id}
            id={r.order.id}
            horseId={r.order.horseId}
            tone="tone-amber"
            extra={`复查日 ${r.order.reviewDueAt}，还剩 ${r.d} 天`}
          />
        ))}
        {soon.length === 0 && <p className="empty">暂无临近复查</p>}

        <h3 className="reminder-h">之后 {later.length}</h3>
        {later.map((r) => (
          <Row
            key={r.order.id}
            id={r.order.id}
            horseId={r.order.horseId}
            tone=""
            extra={`复查日 ${r.order.reviewDueAt}，还剩 ${r.d} 天`}
          />
        ))}
      </section>

      <section className="panel">
        <h2>停待备料</h2>
        <p className="hint">尺寸差超过 2 毫米或适用型号被锁，入库后在详情里重新领料。</p>
        {awaiting.map((o) => (
          <button key={o.id} className="reminder-row tone-red" onClick={() => setOpenId(o.id)}>
            <b>{o.id}</b>
            <span>{o.horseId}</span>
            <span className="grow ellipsis" title={o.stockReason}>
              {o.stockReason ?? "库存不足"}
            </span>
            <span className="chev">›</span>
          </button>
        ))}
        {awaiting.length === 0 && <p className="empty">没有停待备料的单</p>}
      </section>

      <section className="panel">
        <h2>试装与换人确认</h2>
        <h3 className="reminder-h amber">待第二次换人确认 {needConfirm.length}</h3>
        {needConfirm.map((o) => (
          <Row
            key={o.id}
            id={o.id}
            horseId={o.horseId}
            tone="tone-amber"
            extra={`已确认 ${o.confirmations.filter((c) => c.stable).length}/2${
              o.status === "releaseVoid" ? " · 放行失效后重走" : ""
            }`}
          />
        ))}
        {needConfirm.length === 0 && <p className="empty">暂无待确认</p>}

        <h3 className="reminder-h">待登记试装 {needTrial.length}</h3>
        {needTrial.map((o) => (
          <div key={o.id} className="reminder-static" onClick={() => setOpenId(o.id)}>
            <StatusBadge status={o.status} />
            <b>{o.id}</b>
            <span>{o.horseId}</span>
            <span className="grow">蹄铁已锁，登记试装后启动双确认</span>
            <span className="chev">›</span>
          </div>
        ))}
        {needTrial.length === 0 && <p className="empty">暂无待试装</p>}
      </section>

      {openOrder && <OrderDetail order={openOrder} onClose={() => setOpenId(null)} />}
    </div>
  );
}
