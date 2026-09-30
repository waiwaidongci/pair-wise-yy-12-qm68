import type {
  AllocationLine,
  AppState,
  FittingOrder,
  GaitGrade,
  HoofId,
  HoofRecord,
  OrderStatus,
  ShoeSku,
  StockItem,
} from "./types";

export const HOOF_IDS: HoofId[] = ["LF", "RF", "LH", "RH"];

export const HOOF_LABEL: Record<HoofId, string> = {
  LF: "左前蹄",
  RF: "右前蹄",
  LH: "左后蹄",
  RH: "右后蹄",
};

export const GAIT_LABEL: Record<GaitGrade, string> = {
  normal: "步态正常",
  mild: "轻微异常",
  severe: "明显异常",
};

export const GAIT_RANK: Record<GaitGrade, number> = {
  normal: 0,
  mild: 1,
  severe: 2,
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  recording: "建档中",
  ready: "待领料",
  awaitingStock: "停待备料",
  allocated: "蹄铁已锁定·待试装",
  fitting: "试装确认中",
  released: "已放行·待复查",
  releaseVoid: "放行失效·需重新确认",
  completed: "复查归档",
  terminated: "已终止",
};

/** 未结束：一匹马在这些状态上最多挂一张单 */
export const ACTIVE_STATUSES: OrderStatus[] = [
  "recording",
  "ready",
  "awaitingStock",
  "allocated",
  "fitting",
  "released",
  "releaseVoid",
];

export function isActive(order: FittingOrder): boolean {
  return ACTIVE_STATUSES.includes(order.status);
}

export function worstGait(hooves: Record<HoofId, HoofRecord>): GaitGrade {
  let worst: GaitGrade = "normal";
  for (const id of HOOF_IDS) {
    const g = hooves[id].gait;
    if (g !== "" && GAIT_RANK[g] > GAIT_RANK[worst]) worst = g;
  }
  return worst;
}

/**
 * 复查日（自放行之日起）：
 * 四蹄最差步态 正常 42 天 / 轻微异常 21 天 / 明显异常 14 天
 */
export function reviewDays(grade: GaitGrade): number {
  return grade === "normal" ? 42 : grade === "mild" ? 21 : 14;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d.toISOString());
}

export function toISODate(iso: string): string {
  return iso.slice(0, 10);
}

export function todayISO(): string {
  return toISODate(new Date().toISOString());
}

export function fmtDate(iso?: string): string {
  return iso ?? "—";
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86_400_000);
}

/** 单蹄记录齐全：尺寸、步态等级、钉位三项都要有 */
export function isHoofComplete(h: HoofRecord): boolean {
  return h.sizeMm !== "" && h.gait !== "" && h.nailPositions.trim() !== "";
}

export function completeHooves(order: FittingOrder): HoofId[] {
  return HOOF_IDS.filter((id) => isHoofComplete(order.hooves[id]));
}

export function isFourHoovesComplete(order: FittingOrder): boolean {
  return HOOF_IDS.every((id) => isHoofComplete(order.hooves[id]));
}

const EMPTY_HOOF = (): HoofRecord => ({
  sizeMm: "",
  gait: "",
  nailPositions: "",
  shoeType: "",
  note: "",
  updatedAt: "",
});

export function emptyHooves(): Record<HoofId, HoofRecord> {
  return { LF: EMPTY_HOOF(), RF: EMPTY_HOOF(), LH: EMPTY_HOOF(), RH: EMPTY_HOOF() };
}

/** 尺寸差容差（毫米）：超过即停待备料 */
export const MAX_SIZE_DIFF_MM = 2;

interface SkuView extends ShoeSku {
  total: number;
  locked: number;
  available: number;
}

export interface StockView {
  sku: string;
  shoeType: string;
  sizeMm: number;
  hoof: ShoeSku["hoof"];
  total: number;
  locked: number;
  available: number;
}

export function stockViews(state: AppState): StockView[] {
  const locks: Record<string, number> = {};
  for (const o of state.orders) {
    if (!isActive(o)) continue;
    for (const line of o.allocations) {
      locks[line.sku] = (locks[line.sku] ?? 0) + 1;
    }
  }
  const qtyOf = (sku: string): number =>
    state.stock.find((s) => s.sku === sku)?.qty ?? 0;
  const seen = new Set<string>();
  const views: StockView[] = [];
  for (const s of state.shoeCatalog) {
    if (seen.has(s.sku)) continue;
    seen.add(s.sku);
    const total = qtyOf(s.sku);
    const locked = locks[s.sku] ?? 0;
    views.push({
      sku: s.sku,
      shoeType: s.shoeType,
      sizeMm: s.sizeMm,
      hoof: s.hoof,
      total,
      locked,
      available: total - locked,
    });
  }
  // 库存里有但目录缺失的也展示出来
  for (const item of state.stock) {
    if (seen.has(item.sku)) continue;
    seen.add(item.sku);
    views.push({
      sku: item.sku,
      shoeType: "未登记型号",
      sizeMm: 0,
      hoof: "any",
      total: item.qty,
      locked: locks[item.sku] ?? 0,
      available: item.qty - (locks[item.sku] ?? 0),
    });
  }
  return views;
}

export interface PlanLine {
  hoof: HoofId;
  measured: number;
  sku?: string;
  shoeType: string;
  sizeMm?: number;
  diffMm?: number;
  /** none=无库存 / farDiff=最近的也超 2mm / blocker=被别的适配单锁定 */
  reason?: "farDiff" | "blocker";
  blockerOrder?: string;
}

export interface RequisitionPlan {
  ok: boolean;
  lines: PlanLine[];
  reason?: string;
}

function hoofCandidates(views: SkuView[], hoof: HoofId): SkuView[] {
  return views
    .filter((v) => v.hoof === "any" || v.hoof === hoof)
    .sort((a, b) => a.sizeMm - b.sizeMm);
}

/**
 * 领料方案（原子预演，不产生副作用）：
 * 四蹄逐蹄挑尺寸最近的蹄铁；尺寸差 >2mm 直接停待备料；
 * 可用库存按 LF→RF→LH→RH 顺序消耗，被活动单锁定的型号视为 0 可用。
 * excludeOrderId 重算时排除本单自己的锁定。
 */
export function planRequisition(
  state: AppState,
  order: FittingOrder,
  excludeOrderId?: string
): RequisitionPlan {
  const views: SkuView[] = stockViews(state).map((v) => ({
    sku: v.sku,
    shoeType: v.shoeType,
    sizeMm: v.sizeMm,
    hoof: v.hoof,
    total: v.total,
    locked: v.locked,
    // 排除自己的锁后重新算可用
    available:
      v.total -
      v.locked +
      (excludeOrderId
        ? order.allocations.filter((l) => l.sku === v.sku).length
        : 0),
  }));

  const lines: PlanLine[] = [];
  let ok = true;
  let stopReason: string | undefined;

  for (const hoof of HOOF_IDS) {
    const hr = order.hooves[hoof];
    const measured = Number(hr.sizeMm);
    const cands = hoofCandidates(views, hoof);

    let line: PlanLine;
    // 1) 容差内优先同类型、再比尺寸差；2) 退到任意类型容差内；3) 都没有才按最近型号报超差
    const withDiff = cands.map((c) => ({
      c,
      diff: Math.abs(c.sizeMm - measured),
    }));
    const withinTol = withDiff.filter((x) => x.diff <= MAX_SIZE_DIFF_MM);
    const sameTypeWithin = withinTol.filter((x) => x.c.shoeType === hr.shoeType);
    const nearestOverall =
      withDiff.length > 0
        ? [...withDiff].sort((a, b) => a.diff - b.diff)[0]
        : undefined;
    const pickPool =
      sameTypeWithin.length > 0
        ? sameTypeWithin
        : withinTol.length > 0
          ? withinTol
          : undefined;
    const picked = pickPool
      ? [...pickPool].sort((a, b) => a.diff - b.diff)[0].c
      : undefined;

    if (!nearestOverall) {
      ok = false;
      stopReason ??= `${HOOF_LABEL[hoof]}无可用型号`;
      line = { hoof, measured, shoeType: hr.shoeType || "任意", reason: "farDiff" };
    } else if (!picked) {
      const { c, diff } = nearestOverall;
      ok = false;
      stopReason ??= `${HOOF_LABEL[hoof]}实测 ${measured}mm，最近型号 ${c.shoeType} ${c.sizeMm}mm，尺寸差 ${diff}mm 超过 ${MAX_SIZE_DIFF_MM}mm，停待备料`;
      line = {
        hoof,
        measured,
        shoeType: c.shoeType,
        sizeMm: c.sizeMm,
        diffMm: diff,
        reason: "farDiff",
      };
    } else {
      const best = picked;
      const diff = Math.abs(best.sizeMm - measured);
      if (best.available <= 0) {
        // 尺寸合适但可用为 0：找一张锁它的活动单作为占用方
        const blocker = state.orders.find(
          (o) =>
            isActive(o) &&
            o.id !== excludeOrderId &&
            o.allocations.some((l) => l.sku === best.sku)
        );
        ok = false;
        stopReason ??= `${HOOF_LABEL[hoof]}适用型号 ${best.sku}（${best.sizeMm}mm）已被${
          blocker ? `适配单 ${blocker.id}` : "其他适配单"
        }锁定，停待备料`;
        line = {
          hoof,
          measured,
          shoeType: best.shoeType,
          sizeMm: best.sizeMm,
          diffMm: diff,
          reason: "blocker",
          blockerOrder: blocker?.id,
        };
      } else {
        line = {
          hoof,
          measured,
          sku: best.sku,
          shoeType: best.shoeType,
          sizeMm: best.sizeMm,
          diffMm: diff,
        };
        best.available -= 1;
      }
    }
    lines.push(line);
  }

  return { ok, lines, reason: ok ? undefined : stopReason };
}

export function linesToAllocations(lines: PlanLine[]): AllocationLine[] {
  const out: AllocationLine[] = [];
  for (const l of lines) {
    if (l.sku && l.sizeMm !== undefined && l.diffMm !== undefined) {
      out.push({
        hoof: l.hoof,
        sku: l.sku,
        shoeType: l.shoeType,
        sizeMm: l.sizeMm,
        diffMm: l.diffMm,
      });
    }
  }
  return out;
}

/** 试装确认要求：换人连续两次步态稳定（且确认人不得是本单蹄铁师） */
export function canConfirm(order: FittingOrder, by: string): string | null {
  const name = by.trim();
  if (!name) return "请填写确认人";
  if (order.farrier && name === order.farrier)
    return `蹄铁师本人不能确认自己的活，请换人（蹄铁师：${order.farrier}）`;
  const last = order.confirmations[order.confirmations.length - 1];
  if (last?.stable && last.by === name)
    return "连续两次必须换人确认，请另一位师傅确认";
  return null;
}

export function needTrial(order: FittingOrder): boolean {
  return !order.trialAt;
}

export function buildReviewDue(
  releasedAtISO: string,
  hooves: Record<HoofId, HoofRecord>
): string {
  return addDays(toISODate(releasedAtISO), reviewDays(worstGait(hooves)));
}

export function horseActiveOrder(
  orders: FittingOrder[],
  horseId: string
): FittingOrder | undefined {
  return orders.find((o) => o.horseId === horseId && isActive(o));
}

export function stockTotalOf(stock: StockItem[], sku: string): number {
  return stock.find((s) => s.sku === sku)?.qty ?? 0;
}
