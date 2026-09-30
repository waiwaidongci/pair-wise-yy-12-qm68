import React from "react";
import { OrderStatus } from "../types";
import { STATUS_META } from "../store";

export function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="badge"
      style={{ color: meta.color, borderColor: meta.color, background: `${meta.color}14` }}
    >
      {meta.label}
    </span>
  );
}

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: "draft", label: "待完善" },
  { key: "ready_to_pick", label: "待领料" },
  { key: "material_picked", label: "已领料" },
  { key: "trial_fitting", label: "试装中" },
  { key: "released", label: "已放行" },
];

export function Stepper({ status }: { status: OrderStatus }) {
  if (status === "closed") {
    return (
      <div className="stepper">
        <span className="step done">已结束 · 归入履历</span>
      </div>
    );
  }
  const activeIdx = STEPS.findIndex((s) => s.key === status);
  const waiting = status === "waiting_material";
  return (
    <div className="stepper">
      {STEPS.map((s, i) => {
        let cls = "step";
        if (i < activeIdx || status === "released") cls += " done";
        if (i === activeIdx && !waiting) cls += " active";
        return (
          <React.Fragment key={s.key}>
            <span className={cls}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="sep">→</span>}
          </React.Fragment>
        );
      })}
      {waiting && <span className="step waiting">待备料</span>}
    </div>
  );
}

export function Toast({ toast }: { toast: { type: "success" | "error"; text: string } | null }) {
  if (!toast) return null;
  return <div className={`toast toast-${toast.type}`}>{toast.text}</div>;
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
