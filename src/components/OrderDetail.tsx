import { useMemo, useState } from "react";
import type { FittingOrder, GaitGrade, HoofId, HoofRecord } from "../types";
import {
  completeHooves,
  daysBetween,
  GAIT_LABEL,
  HOOF_IDS,
  HOOF_LABEL,
  isFourHoovesComplete,
  isHoofComplete,
  MAX_SIZE_DIFF_MM,
  planRequisition,
  reviewDays,
  todayISO,
  worstGait,
} from "../domain";
import { useStore } from "../store";
import { GaitBadge, Modal, StatusBadge } from "./ui";

const SHOE_TYPES = ["铝蹄铁", "钢蹄铁", "加护蹄垫"];

function HoofEditor({ order, hoof }: { order: FittingOrder; hoof: HoofId }) {
  const { updateHoof } = useStore();
  const rec = order.hooves[hoof];
  const [draft, setDraft] = useState<HoofRecord>(rec);
  const [touched, setTouched] = useState(false);

  const readOnly =
    order.status === "completed" || order.status === "terminated";
  const dirty =
    String(draft.sizeMm) !== String(rec.sizeMm) ||
    draft.gait !== rec.gait ||
    draft.nailPositions !== rec.nailPositions ||
    draft.shoeType !== rec.shoeType ||
    draft.note !== rec.note;

  const sizeNum = draft.sizeMm === "" ? NaN : Number(draft.sizeMm);
  const sizeInvalid = draft.sizeMm !== "" && (!Number.isFinite(sizeNum) || sizeNum <= 0);
  // 允许逐项补录（如先量尺寸，稍后再评步态/钉位）；齐全性由状态机统一判定
  const canSave = !readOnly && !sizeInvalid && dirty;

  const save = () => {
    updateHoof(order.id, hoof, {
      sizeMm: draft.sizeMm === "" ? "" : Number(draft.sizeMm),
      gait: draft.gait,
      nailPositions: draft.nailPositions.trim(),
      shoeType: draft.shoeType.trim(),
      note: draft.note.trim(),
    });
    setTouched(false);
  };

  const complete = isHoofComplete(rec);

  return (
    <div className={`hoof-card ${complete ? "hoof-ok" : "hoof-missing"}`}>
      <div className="hoof-head">
        <b>{HOOF_LABEL[hoof]}</b>
        {complete ? (
          <span className="tag tag-green">齐全</span>
        ) : (
          <span className="tag tag-red">缺项</span>
        )}
      </div>
      <label className="mini">
        <span>实测尺寸（mm）</span>
        <input
          type="number"
          value={draft.sizeMm}
          disabled={readOnly}
          onChange={(e) => {
            setDraft({ ...draft, sizeMm: e.target.value === "" ? "" : Number(e.target.value) });
            setTouched(true);
          }}
          placeholder="如 124"
        />
        {sizeInvalid && <em className="field-err">尺寸需为正数</em>}
      </label>
      <label className="mini">
        <span>步态等级</span>
        <select
          value={draft.gait}
          disabled={readOnly}
          onChange={(e) => {
            setDraft({ ...draft, gait: e.target.value as GaitGrade | "" });
            setTouched(true);
          }}
        >
          <option value="">未评估</option>
          {(["normal", "mild", "severe"] as GaitGrade[]).map((g) => (
            <option key={g} value={g}>
              {GAIT_LABEL[g]}
            </option>
          ))}
        </select>
      </label>
      <label className="mini">
        <span>钉位</span>
        <input
          value={draft.nailPositions}
          disabled={readOnly}
          onChange={(e) => {
            setDraft({ ...draft, nailPositions: e.target.value });
            setTouched(true);
          }}
          placeholder="如 3·6·9 点位"
        />
      </label>
      <label className="mini">
        <span>蹄铁类型</span>
        <input
          list="shoe-types"
          value={draft.shoeType}
          disabled={readOnly}
          onChange={(e) => {
            setDraft({ ...draft, shoeType: e.target.value });
            setTouched(true);
          }}
          placeholder="领料用，可留空"
        />
      </label>
      <label className="mini">
        <span>蹄形评估 / 备注</span>
        <input
          value={draft.note}
          disabled={readOnly}
          onChange={(e) => {
            setDraft({ ...draft, note: e.target.value });
            setTouched(true);
          }}
          placeholder="裂纹、磨耗等"
        />
      </label>
      {!readOnly && (
        <button className="primary small" disabled={!canSave} onClick={save}>
          {order.status === "released" ? "保存（将作废放行）" : "保存本蹄"}
        </button>
      )}
      {touched && !dirty && <span className="hint">与已保存记录一致</span>}
    </div>
  );
}

export function OrderDetail({ order, onClose }: { order: FittingOrder; onClose: () => void }) {
  const {
    state,
    requisition,
    setTrial,
    addConfirmation,
    archiveOrder,
    terminateOrder,
    updatePhotoNote,
  } = useStore();
  const [confirmBy, setConfirmBy] = useState("");
  const [noteDraft, setNoteDraft] = useState(order.photoNote);

  // 详情中始终用最新状态（编辑保存后 order prop 会更新）
  const live = state.orders.find((o) => o.id === order.id) ?? order;

  const plan = useMemo(() => {
    if (["ready", "awaitingStock"].includes(live.status)) {
      return planRequisition(state, live, live.id);
    }
    return null;
  }, [state, live]);

  const allComplete = isFourHoovesComplete(live);
  const completeCount = completeHooves(live).length;
  const inFlight = !!state.requisitionInFlight[live.id];
  const worst = worstGait(live.hooves);
  const today = todayISO();

  const reviewDaysText =
    worst === "normal" ? "42 天" : worst === "mild" ? "21 天" : worst === "severe" ? "14 天" : "—";

  return (
    <Modal title={`适配单 ${live.id} · ${live.horseId}`} onClose={onClose} wide>
      <datalist id="shoe-types">
        {SHOE_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="detail-head">
        <StatusBadge status={live.status} />
        <span>蹄铁师：<b>{live.farrier}</b></span>
        <span>建档：{live.createdAt}</span>
        {live.releasedAt && <span>放行：{live.releasedAt}</span>}
        {live.reviewDueAt && (
          <span>
            复查日：<b>{live.reviewDueAt}</b>
            {live.status === "released" && (
              <em className={daysBetween(today, live.reviewDueAt) < 0 ? "field-err" : "hint"}>
                {" "}（{daysBetween(today, live.reviewDueAt) >= 0 ? "还剩 " : "已逾期 "}
                {Math.abs(daysBetween(today, live.reviewDueAt))} 天）
              </em>
            )}
          </span>
        )}
        {live.releaseVersion > 0 && (
          <span className="tag tag-red">放行已失效 {live.releaseVersion} 次</span>
        )}
      </div>

      {live.status === "releaseVoid" && (
        <div className="callout callout-red">
          任一蹄记录被修改，原放行与复查日已作废。蹄铁仍锁定，重新试装并由两位不同师傅连续确认稳定后重新放行、重算复查日。
        </div>
      )}

      <section className="detail-section">
        <div className="section-title">
          <h3>四蹄记录</h3>
          <span className={allComplete ? "tag tag-green" : "tag tag-amber"}>
            齐全 {completeCount}/4
          </span>
        </div>
        <div className="hoof-grid">
          {HOOF_IDS.map((h) => (
            <HoofEditor
              key={`${h}-${live.hooves[h].updatedAt}-${live.status}-${live.releaseVersion}`}
              order={live}
              hoof={h}
            />
          ))}
        </div>
        <p className="hint">
          四蹄最差步态：
          <GaitBadge gait={worst} />
          {allComplete && <> · 若现在放行，复查周期为 <b>{reviewDaysText}</b>（{reviewDays(worst)} 天）</>}
        </p>
      </section>

      {(live.status === "ready" || live.status === "awaitingStock") && (
        <section className="detail-section">
          <div className="section-title">
            <h3>领料预检</h3>
            {!allComplete && <span className="tag tag-red">尺寸 / 步态 / 钉位未齐，不能领料</span>}
          </div>
          {allComplete && plan && (
            <>
              <div className="plan-rows">
                {plan.lines.map((l) => (
                  <div key={l.hoof} className={`plan-row ${l.sku ? "ok" : "bad"}`}>
                    <b>{HOOF_LABEL[l.hoof]}</b>
                    <span>实测 {l.measured}mm</span>
                    {l.sku ? (
                      <>
                        <span>
                          领 {l.shoeType} {l.sku}（{l.sizeMm}mm，差 {l.diffMm}mm）
                        </span>
                        <span className="tag tag-green">可锁</span>
                      </>
                    ) : (
                      <>
                        <span>
                          最近：{l.shoeType}
                          {l.sizeMm ? ` ${l.sizeMm}mm` : ""}
                          {l.diffMm !== undefined ? `，差 ${l.diffMm}mm` : ""}
                        </span>
                        <span className="tag tag-red">
                          {l.reason === "farDiff" ? `超 ${MAX_SIZE_DIFF_MM}mm 停待备料` : "库存被锁定"}
                          {l.blockerOrder ? `（${l.blockerOrder}）` : ""}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="action-row">
                <button
                  className="primary"
                  disabled={!plan.ok || inFlight}
                  onClick={() => requisition(live.id)}
                >
                  {inFlight ? "领用锁定中…" : plan.ok ? "领料并锁定四蹄" : "领料（将停待备料）"}
                </button>
                {!plan.ok && <span className="field-err">{plan.reason}</span>}
                <span className="hint">重复点击或并发请求只保留先到的一笔</span>
              </div>
            </>
          )}
          {live.stockReason && !plan?.ok && allComplete && (
            <p className="field-err">上次结果：{live.stockReason}</p>
          )}
        </section>
      )}

      {live.allocations.length > 0 && live.status !== "completed" && (
        <section className="detail-section">
          <div className="section-title">
            <h3>已锁定蹄铁（领出即锁）</h3>
            <span className="tag tag-amber">{live.allocations.length} 只</span>
          </div>
          <div className="alloc-rows">
            {live.allocations.map((a) => (
              <div key={a.hoof} className="alloc-row">
                <b>{HOOF_LABEL[a.hoof]}</b>
                <span>{a.sku}</span>
                <span>{a.shoeType} {a.sizeMm}mm</span>
                <span className={a.diffMm > 0 ? "hint" : "tag tag-green"}>
                  尺寸差 {a.diffMm}mm
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {["allocated", "fitting", "releaseVoid"].includes(live.status) && (
        <section className="detail-section">
          <div className="section-title">
            <h3>试装与换人双确认</h3>
            {live.confirmations.length > 0 && (
              <span className="tag tag-amber">已确认 {live.confirmations.length}/2</span>
            )}
          </div>
          {!live.trialAt ? (
            <div className="action-row">
              <button
                className="primary"
                disabled={live.allocations.length !== 4}
                onClick={() => setTrial(live.id)}
              >
                登记今日试装完成
              </button>
              <span className="hint">试装后才能做步态确认</span>
            </div>
          ) : (
            <>
              <p className="hint">试装日期：{live.trialAt.slice(0, 10)}；蹄铁师 {live.farrier} 不能确认本人的活，两次确认须换人。</p>
              <ul className="confirm-list">
                {live.confirmations.map((c, i) => (
                  <li key={i}>
                    第 {i + 1} 次 · {c.by} · {c.at.replace("T", " ").slice(0, 16)} · 步态稳定
                  </li>
                ))}
              </ul>
              <div className="action-row">
                <input
                  className="name-input"
                  value={confirmBy}
                  onChange={(e) => setConfirmBy(e.target.value)}
                  placeholder="确认人姓名（须与上一位不同）"
                />
                <button
                  className="primary"
                  disabled={live.confirmations.length >= 2}
                  onClick={() => {
                    addConfirmation(live.id, confirmBy, true);
                    setConfirmBy("");
                  }}
                >
                  {live.confirmations.length === 0 ? "第 1 次确认稳定" : "换人第 2 次确认并放行"}
                </button>
                <button
                  disabled={live.confirmations.length === 0}
                  onClick={() => {
                    addConfirmation(live.id, confirmBy || "（未署名）", false);
                    setConfirmBy("");
                  }}
                >
                  确认步态不稳（清空重来）
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {live.status === "released" && (
        <section className="detail-section">
          <div className="callout callout-green">
            已放行待复查，复查日 <b>{live.reviewDueAt}</b>。复查通过后归档；此期间修改任一蹄记录会让放行失效并重算复查日。
          </div>
          <div className="action-row">
            <button className="primary" onClick={() => archiveOrder(live.id)}>
              复查通过并归档
            </button>
          </div>
        </section>
      )}

      {(live.status === "completed" || live.status === "terminated") && (
        <section className="detail-section">
          <div className="callout">
            {live.status === "completed"
              ? `已于 ${live.completedAt} 复查归档，锁定蹄铁转为实耗。`
              : `已于 ${live.terminatedAt} 终止，未用蹄铁已退回库存。`}
          </div>
        </section>
      )}

      <section className="detail-section">
        <div className="section-title">
          <h3>照片 / 备注</h3>
        </div>
        <div className="action-row note-row">
          <input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="照片编号、归档说明"
          />
          <button onClick={() => updatePhotoNote(live.id, noteDraft)} disabled={noteDraft === live.photoNote}>
            保存备注
          </button>
        </div>
      </section>

      {live.status !== "completed" && live.status !== "terminated" && live.status !== "released" && (
        <section className="detail-section">
          <button className="danger" onClick={() => terminateOrder(live.id)}>
            终止适配单（退回已锁蹄铁）
          </button>
        </section>
      )}
    </Modal>
  );
}
