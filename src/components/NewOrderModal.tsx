import { useState } from "react";
import { useStore } from "../store";
import { horseActiveOrder } from "../domain";
import { Modal } from "./ui";

export function NewOrderModal({ onClose }: { onClose: () => void }) {
  const { state, createOrder } = useStore();
  const [horseId, setHorseId] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [category, setCategory] = useState<"运动马" | "休养马">("运动马");
  const [farrier, setFarrier] = useState("");

  const activeId = horseId.trim() ? horseActiveOrder(state.orders, horseId.trim())?.id : undefined;
  const freeExisting = state.horses.filter(
    (h) => !horseActiveOrder(state.orders, h.id)
  );

  const submit = () => {
    if (createOrder(horseId, farrier, category)) onClose();
  };

  return (
    <Modal title="新建四蹄适配单" onClose={onClose}>
      <div className="form-stack">
        <div className="seg">
          <button
            className={mode === "existing" ? "seg-on" : ""}
            onClick={() => {
              setMode("existing");
              setHorseId("");
            }}
          >
            选择在册马匹
          </button>
          <button
            className={mode === "new" ? "seg-on" : ""}
            onClick={() => {
              setMode("new");
              setHorseId("");
            }}
          >
            新马匹建档
          </button>
        </div>

        {mode === "existing" ? (
          <label className="mini">
            <span>马匹编号（一匹马最多一张未结束适配单）</span>
            <select value={horseId} onChange={(e) => setHorseId(e.target.value)}>
              <option value="">请选择</option>
              {freeExisting.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.id} · {h.category}
                </option>
              ))}
            </select>
            {freeExisting.length === 0 && <em className="field-err">在册马匹均有未结束适配单</em>}
          </label>
        ) : (
          <>
            <label className="mini">
              <span>新马匹编号（如 HORSE-70）</span>
              <input
                value={horseId}
                onChange={(e) => setHorseId(e.target.value.toUpperCase())}
                placeholder="HORSE-xx"
              />
              {activeId && <em className="field-err">该马已有未结束单 {activeId}</em>}
            </label>
            <label className="mini">
              <span>马匹分类</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as "运动马" | "休养马")}
              >
                <option value="运动马">运动马</option>
                <option value="休养马">休养马</option>
              </select>
            </label>
          </>
        )}

        <label className="mini">
          <span>蹄铁师</span>
          <input value={farrier} onChange={(e) => setFarrier(e.target.value)} placeholder="负责修蹄的师傅姓名" />
        </label>

        <div className="action-row">
          <button className="primary" onClick={submit}>
            建档（补齐四蹄后领料）
          </button>
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </Modal>
  );
}
