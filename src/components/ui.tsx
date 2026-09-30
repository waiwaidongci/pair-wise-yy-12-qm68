import type { ReactNode } from "react";
import { useEffect } from "react";
import type { GaitGrade, OrderStatus } from "../types";
import { GAIT_LABEL, STATUS_LABEL } from "../domain";

const STATUS_CLASS: Record<OrderStatus, string> = {
  recording: "st-gray",
  ready: "st-blue",
  awaitingStock: "st-red",
  allocated: "st-amber",
  fitting: "st-amber",
  released: "st-green",
  releaseVoid: "st-red",
  completed: "st-gray",
  terminated: "st-gray",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

const GAIT_CLASS: Record<GaitGrade, string> = {
  normal: "st-green",
  mild: "st-amber",
  severe: "st-red",
};

export function GaitBadge({ gait }: { gait: GaitGrade | "" }) {
  if (!gait) return <span className="badge st-gray">未评</span>;
  return <span className={`badge ${GAIT_CLASS[gait]}`}>{GAIT_LABEL[gait]}</span>;
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
