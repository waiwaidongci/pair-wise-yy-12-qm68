import React from "react";
import { useStore } from "../StoreContext";
import { HOOF_LIST, GAIT_LABELS } from "../store";
import { StatusBadge } from "./ui";
import { FittingOrder } from "../types";

export function HorseList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (orderId: string) => void;
}) {
  const { state, dispatch } = useStore();
  const openOrders = state.orders.filter((o) => o.status !== "closed");

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>马匹列表</p>
          <h2>马匹与适配单</h2>
        </div>
      </div>
      <div className="horse-list">
        {state.horses.map((horse) => {
          const order = openOrders.find((o) => o.horseId === horse.id);
          const selected = order && order.id === selectedId;
          return (
            <article
              key={horse.id}
              className={`horse-card ${selected ? "selected" : ""} ${order ? "" : "no-order"}`}
              onClick={() => order && onSelect(order.id)}
            >
              <div className="horse-main">
                <b>{horse.id}</b>
                <div>
                  <h3>
                    {horse.name}
                    <span className={`usage-tag ${horse.usage}`}>
                      {horse.usage === "sport" ? "运动马" : "休养马"}
                    </span>
                  </h3>
                  {order ? (
                    <HorseHoofSummary order={order} />
                  ) : (
                    <p className="muted">暂无进行中的适配单</p>
                  )}
                </div>
              </div>
              <div className="horse-actions">
                {order ? (
                  <>
                    <StatusBadge status={order.status} />
                    <button
                      className="link-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(order.id);
                      }}
                    >
                      查看 →
                    </button>
                  </>
                ) : (
                  <button
                    className="primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "CREATE_ORDER", horseId: horse.id });
                    }}
                  >
                    新建适配单
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function HorseHoofSummary({ order }: { order: FittingOrder }) {
  const filled = HOOF_LIST.filter(
    (h) =>
      order.hooves[h.key].size != null &&
      order.hooves[h.key].gaitGrade != null &&
      order.hooves[h.key].nailPosition !== ""
  ).length;
  const gaitIssues = HOOF_LIST.filter(
    (h) => order.hooves[h.key].gaitGrade === "minor" || order.hooves[h.key].gaitGrade === "lame"
  );
  return (
    <p className="hoof-summary">
      四蹄 {filled}/4
      {gaitIssues.length > 0 && (
        <span className="gait-issue">
          {" "}
          · 异常步态标记：
          {gaitIssues.map((h) => `${h.short}(${GAIT_LABELS[order.hooves[h.key].gaitGrade!]})`).join("、")}
        </span>
      )}
    </p>
  );
}
