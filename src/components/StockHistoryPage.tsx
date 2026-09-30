import { useMemo, useState } from "react";
import { useStore } from "../store";
import { HOOF_LABEL } from "../domain";
import { OrderDetail } from "./OrderDetail";

const EVENT_LABEL: Record<string, string> = {
  create: "建档",
  hoofEdit: "改蹄记录",
  requisitionLocked: "领料锁定",
  requisitionStop: "领料停待备料",
  duplicateReject: "重复领用拦截",
  trial: "登记试装",
  confirm: "步态确认",
  confirmReset: "步态不稳退回",
  release: "放行",
  releaseVoid: "放行失效",
  reviewArchive: "复查归档",
  terminate: "终止",
  restock: "蹄铁入库",
};

export function StockHistoryPage() {
  const { state, restock, reset } = useStore();
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState<number | "">("");
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const openOrder = openId ? state.orders.find((o) => o.id === openId) : null;

  const views = useMemo(() => {
    const locks: Record<string, { orderId: string; hoof: string }[]> = {};
    for (const o of state.orders) {
      if (o.status === "completed" || o.status === "terminated") continue;
      for (const a of o.allocations) {
        (locks[a.sku] ??= []).push({ orderId: o.id, hoof: HOOF_LABEL[a.hoof] });
      }
    }
    const qty = (s: string) => state.stock.find((x) => x.sku === s)?.qty ?? 0;
    return state.shoeCatalog
      .map((c) => ({
        ...c,
        total: qty(c.sku),
        locked: (locks[c.sku] ?? []).length,
        holders: locks[c.sku] ?? [],
      }))
      .map((v) => ({ ...v, available: v.total - v.locked }));
  }, [state]);

  const filteredViews = views.filter((v) =>
    filter.trim() ? v.sku.toLowerCase().includes(filter.trim().toLowerCase()) : true
  );

  const eventTypes = Object.keys(EVENT_LABEL);
  const events = [...state.events]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .filter((e) => (typeFilter && eventTypes.includes(typeFilter) ? e.type === typeFilter : true));

  const shoeTypes = [...new Set(views.map((v) => v.shoeType))];

  return (
    <div className="page stock-page">
      <section className="panel">
        <div className="heading">
          <div>
            <p>库存台账</p>
            <h2>蹄铁库存（领出即锁定）</h2>
          </div>
          <button className="ghost-danger" onClick={reset}>
            恢复演示台账
          </button>
        </div>
        <div className="restock-row">
          <input list="sku-list" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="型号，如 ST-RF-138" />
          <datalist id="sku-list">
            {views.map((v) => (
              <option key={v.sku} value={v.sku}>
                {v.shoeType} {v.sizeMm}mm
              </option>
            ))}
          </datalist>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="入库数量"
          />
          <button
            className="primary"
            onClick={() => {
              if (sku && qty) {
                restock(sku, Number(qty));
                setSku("");
                setQty("");
              }
            }}
          >
            入库 / 补料
          </button>
          <input className="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="筛型号" />
        </div>

        <div className="stock-table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>型号</th>
                <th>类型</th>
                <th>适用蹄</th>
                <th>尺寸</th>
                <th>账面</th>
                <th>已锁</th>
                <th>可用</th>
                <th>锁定方</th>
              </tr>
            </thead>
            <tbody>
              {filteredViews.map((v) => (
                <tr key={v.sku} className={v.available <= 0 ? "row-none" : ""}>
                  <td><b>{v.sku}</b></td>
                  <td>{v.shoeType}</td>
                  <td>{v.hoof === "any" ? "通用" : HOOF_LABEL[v.hoof as keyof typeof HOOF_LABEL]}</td>
                  <td>{v.sizeMm}mm</td>
                  <td>{v.total}</td>
                  <td>{v.locked}</td>
                  <td className={v.available <= 0 ? "num-bad" : "num-ok"}>{v.available}</td>
                  <td>
                    {v.holders.map((h, i) => (
                      <button key={i} className="link-btn" onClick={() => setOpenId(h.orderId)}>
                        {h.orderId}（{h.hoof}）
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">可用 = 账面 − 活动适配单锁定。复查归档时锁定蹄铁转实耗扣账面；终止则解锁退回。</p>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>全局履历</p>
            <h2>操作流水（与列表、提醒共用同一状态）</h2>
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">全部事件</option>
            {Object.entries(EVENT_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <ul className="history-feed">
          {events.map((e) => (
            <li key={e.id}>
              <time>{e.at.replace("T", " ").slice(0, 16)}</time>
              <span className={`ev ev-${e.type}`}>{EVENT_LABEL[e.type] ?? e.type}</span>
              <button
                className="ev-order link-btn"
                disabled={!e.orderId}
                onClick={() => e.orderId && setOpenId(e.orderId)}
              >
                {e.orderId ?? "—"}
              </button>
              <span className="ev-msg">{e.message}</span>
            </li>
          ))}
          {events.length === 0 && <li className="empty">暂无记录</li>}
        </ul>
      </section>

      {openOrder && <OrderDetail order={openOrder} onClose={() => setOpenId(null)} />}
    </div>
  );
}
