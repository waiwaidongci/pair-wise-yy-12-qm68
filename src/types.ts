// 蹄位：左前 / 右前 / 左后 / 右后
export type HoofPosition = "LF" | "RF" | "LH" | "RH";

// 步态等级
export type GaitGrade = "normal" | "minor" | "lame";

// 适配单状态机
// draft 待完善 -> ready_to_pick 待领料 -> material_picked 已领料
//   -> trial_fitting 试装中 -> released 已放行 -> closed 已结束
// ready_to_pick / material_picked 遇尺寸差超 2mm -> waiting_material 待备料
export type OrderStatus =
  | "draft"
  | "ready_to_pick"
  | "waiting_material"
  | "material_picked"
  | "trial_fitting"
  | "released"
  | "closed";

// 库存蹄铁
export interface Shoe {
  id: string;
  size: number; // 蹄铁尺寸 mm
  type: string; // 蹄铁类型
  lockedBy: string | null; // 被哪张适配单锁定（领出即锁定）
}

// 单条蹄记录
export interface HoofRecord {
  size: number | null; // 蹄尺寸 mm
  gaitGrade: GaitGrade | null; // 步态等级
  nailPosition: string; // 钉位
  updatedAt: number;
}

// 步态确认记录
export interface GaitConfirmation {
  confirmerId: string;
  confirmerName: string;
  stable: boolean; // true 稳定 / false 不稳定
  at: number;
}

// 适配单日志
export interface OrderLogEntry {
  at: number;
  text: string;
}

// 四蹄记录
export type HoofMap = Record<HoofPosition, HoofRecord>;
export type ShoeMap = Partial<Record<HoofPosition, string>>;

// 适配单
export interface FittingOrder {
  id: string;
  horseId: string;
  status: OrderStatus;
  hooves: HoofMap;
  shoes: ShoeMap; // 蹄位 -> 锁定的蹄铁 id
  trialFitterId: string | null; // 试装人
  trialFitterName: string | null;
  trialFittingAt: number | null;
  confirmations: GaitConfirmation[];
  recheckDate: number | null; // 复查日
  releasedAt: number | null;
  closedAt: number | null;
  createdAt: number;
  log: OrderLogEntry[];
}

export interface Horse {
  id: string; // 马匹编号
  name: string;
  usage: "sport" | "rest"; // 运动马 / 休养马
}

export interface Staff {
  id: string;
  name: string;
}

export type ToastType = "success" | "error";

export interface Toast {
  type: ToastType;
  text: string;
  at: number;
}

export interface State {
  horses: Horse[];
  orders: FittingOrder[];
  shoes: Shoe[];
  staff: Staff[];
  currentUserId: string;
  toast: Toast | null;
}
