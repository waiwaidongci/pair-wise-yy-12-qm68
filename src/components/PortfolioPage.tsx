import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { FittingOrder, Horse } from "../types";
import {
  GAIT_LABEL,
  HOOF_IDS,
  HOOF_LABEL,
  isActive,
  worstGait,
} from "../domain";
import { GaitBadge, StatusBadge } from "./ui";
import { OrderDetail } from "./OrderDetail";

const EVENT_LABEL: Record<string, string> = {
  create: "建档",
  hoofEdit: "改蹄记录",
  requisitionLocked: "领蹄铁",
  requisitionStop: "领料停",
  duplicateReject: "重复领用拦截",
  trial: "试装",
  confirm: "步态确认",
  confirmReset: "步态不稳退回",
  release: "放行",
  releaseVoid: "放行失效",
  reviewArchive: "复查归档",
  terminate: "终止",
  restock: "入库",
};

function HorseCard({ horse, onOpen }: { horse: Horse; onOpen: (id: string) => void }) {
  const { state } = useStore();
  const orders = state.orders.filter((o) => o.horseId === horse.id);
  const active = orders.find(isActive);
  const latest = active ?? orders[0];

  const events = useMemo(
    () =>
      state.events
        .filter((e) => e.horseId === horse.id)
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    [state.events, horse.id]
  );

  return (
    <article className="horse-card">
      <div className="horse-head">
        <div>
          <h3>{horse.id}</h3>
          <small>{horse.category}</small>
        </div>
        {active ? <StatusBadge status={active.status} /> : <span className="tag tag-gray">空闲</span>}
      </div>

      {latest ? (
        <>
          <div className="hoof-compare">
            <div className="hoof-pair">
              <span className="pair-label">前蹄</span>
              {HOOF_IDS.filter((h) => h.endsWith("F")).map((h) => {
                const rec = latest.hooves[h];
                return (
                  <div key={h} className={`compare-cell ${rec.gait === "severe" ? "cell-bad" : rec.gait === "mild" ? "cell-warn" : ""}`}>
                    <b>{HOOF_LABEL[h]}</b>
                    <span>{rec.sizeMm === "" ? "—" : `${rec.sizeMm}mm`}</span>
                    <GaitBadge gait={rec.gait} />
                    <small>{rec.shoeType || "未定型号"}</small>
                    <small>{rec.nailPositions || "钉位未登"}</small>
                  </div>
                );
              })}
            </div>
            <div className="hoof-pair">
              <span className="pair-label">后蹄</span>
              {HOOF_IDS.filter((h) => h.endsWith("H")).map((h) => {
                const rec = latest.hooves[h];
                return (
                  <div key={h} className={`compare-cell ${rec.gait === "severe" ? "cell-bad" : rec.gait === "mild" ? "cell-warn" : ""}`}>
                    <b>{HOOF_LABEL[h]}</b>
                    <span>{rec.sizeMm === "" ? "—" : `${rec.sizeMm}mm`}</span>
                    <GaitBadge gait={rec.gait} />
                    <small>{rec.shoeType || "未定型号"}</small>
                    <small>{rec.nailPositions || "钉位未登"}</small>
                  </div>
                );
              })}
            </div>
          </div>

          {worstGait(latest.hooves) !== "normal" && (
            <div className="abnormal-flag">
              ⚠ 异常步态标记：{GAIT_LABEL[worstGait(latest.hooves)]}
              {HOOF_IDS.filter((h) => latest.hooves[h].gait && latest.hooves[h].gait !== "normal")
                .map((h) => HOOF_LABEL[h])
                .join("、")}
            </div>
          )}

          {latest.allocations.length > 0 && (
            <div className="shoe-now">
              当前蹄铁：
              {latest.allocations.map((a) => (
                <span key={a.hoof} className="tag tag-amber">
                  {HOOF_LABEL[a.hoof]} {a.shoeType} {a.sizeMm}
                </span>
              ))}
            </div>
          )}

          <ul className="horse-history">
            {events.slice(0, 6).map((e) => (
              <li key={e.id}>
                <time>{e.at.replace("T", " ").slice(0, 16)}</time>
                <span className={`ev ev-${e.type}`}>{EVENT_LABEL[e.type] ?? e.type}</span>
                <span className="ev-msg">{e.message.replace(/^.*?\/.*?\s*/, "")}</span>
              </li>
            ))}
            {events.length === 0 && <li className="empty">暂无履历</li>}
          </ul>

          <button className="primary small" onClick={() => onOpen(latest.id)}>
            打开适配单 {latest.id}
          </button>
        </>
      ) : (
        <p className="empty">还没有适配记录</p>
      )}
    </article>
  );
}

export function PortfolioPage() {
  const { state } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const openOrder = openId ? state.orders.find((o) => o.id === openId) : null;

  return (
    <div className="page">
      <p className="hint">一匹马至多一张未结束适配单；卡片上的四蹄对比、异常步态与换蹄铁履历与列表、提醒共用同一状态。</p>
      <div className="horse-grid">
        {state.horses.map((h) => (
          <HorseCard key={h.id} horse={h} onOpen={setOpenId} />
        ))}
      </div>
      {openOrder && <OrderDetail order={openOrder as FittingOrder} onClose={() => setOpenId(null)} />}
    </div>
  );
}
