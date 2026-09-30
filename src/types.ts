// 四蹄适配与复查放行 —— 领域类型定义

export type HoofId = "LF" | "RF" | "LH" | "RH";

/** 步态等级：正常 / 轻微异常 / 明显异常 */
export type GaitGrade = "normal" | "mild" | "severe";

export type HorseCategory = "运动马" | "休养马";

/** 单蹄记录：尺寸、步态等级、钉位三项齐全后才允许领料 */
export interface HoofRecord {
  /** 实测蹄径（毫米），"" 表示未量 */
  sizeMm: number | "";
  gait: GaitGrade | "";
  /** 钉位描述，如 "3·6·9 点位" */
  nailPositions: string;
  /** 蹄铁类型（铝蹄铁 / 钢蹄铁 / 加护蹄垫……） */
  shoeType: string;
  /** 蹄形评估 / 步态问题备注 */
  note: string;
  updatedAt: string;
}

/**
 * 适配单状态机
 * recording 建档中 → ready 待领料 → allocated 蹄铁已锁定待试装
 * → fitting 试装确认中 → released 已放行待复查 → completed 复查归档
 * 任一步领料失败：awaitingStock 停待备料
 * 放行后修改任一蹄记录：releaseVoid 放行失效
 * terminated 中途终止
 */
export type OrderStatus =
  | "recording"
  | "ready"
  | "awaitingStock"
  | "allocated"
  | "fitting"
  | "released"
  | "releaseVoid"
  | "completed"
  | "terminated";

export interface AllocationLine {
  hoof: HoofId;
  sku: string;
  shoeType: string;
  sizeMm: number;
  /** 实测尺寸与所领蹄铁的尺寸差（毫米，绝对值） */
  diffMm: number;
}

export interface GaitConfirmation {
  by: string;
  at: string;
  stable: boolean;
}

export interface FittingOrder {
  id: string;
  horseId: string;
  farrier: string;
  createdAt: string;
  status: OrderStatus;
  hooves: Record<HoofId, HoofRecord>;
  /** 领出即锁定的蹄铁 */
  allocations: AllocationLine[];
  /** 最近一次停待备料原因 */
  stockReason?: string;
  /** 试装日期（试装登记后才允许步态确认） */
  trialAt?: string;
  confirmations: GaitConfirmation[];
  releasedAt?: string;
  /** 下次复查日；放行失效后清空，重新放行时重算 */
  reviewDueAt?: string;
  /** 放行代数：每次因改记录失效 +1 */
  releaseVersion: number;
  completedAt?: string;
  terminatedAt?: string;
  /** 照片备注 */
  photoNote: string;
}

export interface ShoeSku {
  sku: string;
  shoeType: string;
  sizeMm: number;
  hoof: HoofId | "any";
}

export interface StockItem {
  sku: string;
  qty: number;
}

export interface Horse {
  id: string;
  category: HorseCategory;
}

export type EventType =
  | "create"
  | "hoofEdit"
  | "requisitionLocked"
  | "requisitionStop"
  | "duplicateReject"
  | "trial"
  | "confirm"
  | "confirmReset"
  | "release"
  | "releaseVoid"
  | "reviewArchive"
  | "terminate"
  | "restock";

export interface HistoryEvent {
  id: string;
  at: string;
  type: EventType;
  orderId?: string;
  horseId?: string;
  message: string;
}

export interface AppState {
  version: number;
  horses: Horse[];
  orders: FittingOrder[];
  shoeCatalog: ShoeSku[];
  stock: StockItem[];
  events: HistoryEvent[];
  /** 正在领用中的适配单（重复请求直接拦掉，只留先到的） */
  requisitionInFlight: Record<string, boolean>;
}

export interface Toast {
  id: number;
  kind: "ok" | "warn" | "err";
  text: string;
}
