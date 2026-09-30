import React, { useState } from "react";
import { useStore } from "../StoreContext";
import {
  HOOF_LIST,
  NAIL_POSITIONS,
  SIZE_TOLERANCE_MM,
  fmtDate,
  fmtDateTime,
  stableStreak,
} from "../store";
import { HoofPosition, FittingOrder, GaitGrade } from "../types";
import { StatusBadge, Stepper } from "./ui";

export function OrderDetail({ order }: { order: FittingOrder }) {
  const { state, dispatch } = useStore();
  const [confirmerId, setConfirmerId] = useState("");
  const [restockSize, setRestockSize] = useState(122);
  const [restockType, setRestockType] = useState("铝蹄铁");
  const [pickShoe, setPickShoe] = useState<Partial<Record<HoofPosition, string>>>({});

  const horse = state.horses.find((h) => h.id === order.horseId);
  const canEdit = order.status !== "closed";
  const canPick = order.status === "ready_to_pick" || order.status === "waiting_material";
  const canStartTrial = order.status === "material_picked";
  const canConfirm = order.status === "trial_fitting";
  const canClose = order.status === "released";

  const eligibleConfirmers = state.staff.filter((s) => s.id !== order.trialFitterId);
  const streak = stableStreak(order);

  // 并发领用演示：同一只未锁定蹄铁对两张可领料适配单同时领用，先到先得
  const demoConcurrentPick = () => {
    const pickable = state.orders.filter(
      (o) => o.status === "ready_to_pick" || o.status === "waiting_material"
    );
    if (pickable.length < 2) return;
    const [a, b] = pickable;
    const aSize = a.hooves.LF.size;
    const shoe =
      state.shoes.find(
        (s) => !s.lockedBy && (aSize == null || Math.abs(s.size - aSize) <= SIZE_TOLERANCE_MM)
      ) ?? state.shoes.find((s) => !s.lockedBy);
    if (!shoe) return;
    dispatch({ type: "PICK_SHOE", orderId: a.id, hoof: "LF", shoeId: shoe.id });
    dispatch({ type: "PICK_SHOE", orderId: b.id, hoof: "LF", shoeId: shoe.id });
  };

  return (
    <section className="panel order-detail">
      <div className="heading">
        <div>
          <p>适配单</p>
          <h2>
            {horse?.id} {horse?.name}
            <StatusBadge status={order.status} />
          </h2>
        </div>
        <div className="order-meta">
          <span>修蹄 {fmtDate(order.createdAt)}</span>
          <span>
            复查日 <b>{fmtDate(order.recheckDate)}</b>
          </span>
        </div>
      </div>

      <Stepper status={order.status} />

      {order.status === "waiting_material" && (
        <div className="banner banner-red">
          尺寸差超过 {SIZE_TOLERANCE_MM}mm 或缺料，已停待备料。可补货或改选蹄铁后重新领用。
          <div className="restock-row">
            <label>
              <span>补货尺寸(mm)</span>
              <input
                type="number"
                value={restockSize}
                onChange={(e) => setRestockSize(Number(e.target.value))}
              />
            </label>
            <label>
              <span>类型</span>
              <select value={restockType} onChange={(e) => setRestockType(e.target.value)}>
                <option>铝蹄铁</option>
                <option>钢蹄铁</option>
              </select>
            </label>
            <button
              className="primary"
              onClick={() =>
                dispatch({
                  type: "RESTOCK",
                  shoe: { id: `X-${restockSize}-${Date.now().toString().slice(-4)}`, size: restockSize, type: restockType },
                })
              }
            >
              补货入库
            </button>
          </div>
        </div>
      )}

      <div className="hoof-grid">
        {HOOF_LIST.map((h) => {
          const hoof = order.hooves[h.key];
          const shoeId = order.shoes[h.key];
          const shoe = state.shoes.find((s) => s.id === shoeId);
          const diff = shoe && hoof.size != null ? Math.abs(shoe.size - hoof.size) : null;
          return (
            <article key={h.key} className="hoof-card">
              <header>
                <b>{h.short}</b>
                <span>{h.label}</span>
              </header>

              <label>
                <span>蹄尺寸 (mm)</span>
                <input
                  type="number"
                  disabled={!canEdit}
                  value={hoof.size ?? ""}
                  placeholder="填写尺寸"
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_HOOF",
                      orderId: order.id,
                      hoof: h.key,
                      patch: { size: e.target.value === "" ? null : Number(e.target.value) },
                    })
                  }
                />
              </label>

              <label>
                <span>步态等级</span>
                <select
                  disabled={!canEdit}
                  value={hoof.gaitGrade ?? ""}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_HOOF",
                      orderId: order.id,
                      hoof: h.key,
                      patch: { gaitGrade: (e.target.value || null) as GaitGrade | null },
                    })
                  }
                >
                  <option value="">未评定</option>
                  <option value="normal">正常</option>
                  <option value="minor">轻微不稳</option>
                  <option value="lame">异常跛行</option>
                </select>
              </label>

              <label>
                <span>钉位</span>
                <select
                  disabled={!canEdit}
                  value={hoof.nailPosition}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_HOOF",
                      orderId: order.id,
                      hoof: h.key,
                      patch: { nailPosition: e.target.value },
                    })
                  }
                >
                  <option value="">未选择</option>
                  {NAIL_POSITIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <div className="shoe-pick">
                {shoe ? (
                  <div className="shoe-locked">
                    已锁定 <b>{shoe.id}</b>（{shoe.size}mm {shoe.type}）
                    {diff != null && diff > SIZE_TOLERANCE_MM && (
                      <em className="diff-warn">差 {diff}mm</em>
                    )}
                  </div>
                ) : (
                  <>
                    <select
                      disabled={!canPick || hoof.size == null}
                      value={pickShoe[h.key] ?? ""}
                      onChange={(e) => setPickShoe((p) => ({ ...p, [h.key]: e.target.value }))}
                    >
                      <option value="" disabled>
                        选择蹄铁
                      </option>
                      {state.shoes.map((s) => {
                        const d = hoof.size != null ? Math.abs(s.size - hoof.size) : null;
                        const lockedByOther = s.lockedBy && s.lockedBy !== order.id;
                        return (
                          <option key={s.id} value={s.id} disabled={!!lockedByOther}>
                            {s.id} · {s.size}mm {s.type}
                            {d != null ? `（差${d}mm）` : ""}
                            {lockedByOther ? " · 已锁定" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      disabled={!canPick || hoof.size == null || !pickShoe[h.key]}
                      onClick={() => {
                        const shoeId = pickShoe[h.key];
                        if (shoeId) {
                          dispatch({
                            type: "PICK_SHOE",
                            orderId: order.id,
                            hoof: h.key,
                            shoeId,
                          });
                          setPickShoe((p) => ({ ...p, [h.key]: "" }));
                        }
                      }}
                    >
                      领用锁定
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="action-bar">
        <button
          className="primary"
          disabled={!canPick}
          onClick={() => dispatch({ type: "AUTO_PICK", orderId: order.id })}
        >
          四蹄匹配领料
        </button>
        <button disabled={!canPick} onClick={demoConcurrentPick}>
          模拟并发领用（先到先得）
        </button>
        <button className="primary" disabled={!canStartTrial} onClick={() => dispatch({ type: "START_TRIAL", orderId: order.id })}>
          开始试装
        </button>
        <button className="primary" disabled={!canClose} onClick={() => dispatch({ type: "CLOSE_ORDER", orderId: order.id })}>
          结束并归入履历
        </button>
      </div>

      {canConfirm && (
        <div className="confirm-panel">
          <h3>试装后步态确认</h3>
          <p className="muted">
            试装人：{order.trialFitterName}（不能确认本单）。需换人连续两次确认步态稳定方可放行。
          </p>
          <div className="confirm-streak">
            已连续稳定确认 <b>{streak}</b> / 2 次
            {order.confirmations.some((c) => !c.stable) && (
              <span className="muted">（含不稳定记录，连续计数已清零重计）</span>
            )}
          </div>
          <div className="confirm-row">
            <label>
              <span>确认人（换人）</span>
              <select value={confirmerId} onChange={(e) => setConfirmerId(e.target.value)}>
                <option value="">选择确认人</option>
                {eligibleConfirmers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={!confirmerId}
              onClick={() => {
                dispatch({ type: "CONFIRM_TRIAL", orderId: order.id, confirmerId, stable: true });
                setConfirmerId("");
              }}
            >
              确认步态稳定
            </button>
            <button
              className="danger"
              disabled={!confirmerId}
              onClick={() => {
                dispatch({ type: "CONFIRM_TRIAL", orderId: order.id, confirmerId, stable: false });
                setConfirmerId("");
              }}
            >
              确认不稳定
            </button>
          </div>
          {order.confirmations.length > 0 && (
            <ul className="confirm-log">
              {order.confirmations.map((c, i) => (
                <li key={i} className={c.stable ? "ok" : "bad"}>
                  {fmtDateTime(c.at)} · {c.confirmerName} · {c.stable ? "稳定" : "不稳定"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="order-log">
        <h3>操作履历</h3>
        <ul>
          {order.log.map((entry, i) => (
            <li key={i}>
              <span className="log-time">{fmtDateTime(entry.at)}</span>
              <span>{entry.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
