import type {
  AppState,
  FittingOrder,
  GaitGrade,
  HoofId,
  HoofRecord,
  ShoeSku,
} from "./types";
import { addDays, emptyHooves, todayISO } from "./domain";

export const STORAGE_KEY = "farrier-fitting-state-v1";

const catalog: ShoeSku[] = [];
for (const hoof of ["LF", "RF", "LH", "RH"] as HoofId[]) {
  for (const size of [116, 120, 124, 128, 132]) {
    catalog.push({ sku: `AL-${hoof}-${size}`, shoeType: "铝蹄铁", sizeMm: size, hoof });
  }
  for (const size of [125, 129, 133, 135]) {
    catalog.push({ sku: `ST-${hoof}-${size}`, shoeType: "钢蹄铁", sizeMm: size, hoof });
  }
  catalog.push({ sku: `PD-${hoof}-128`, shoeType: "加护蹄垫", sizeMm: 128, hoof });
}

export function initialState(): AppState {
  const today = todayISO();

  const hoof = (
    sizeMm: number | "",
    gait: GaitGrade | "",
    nailPositions: string,
    shoeType = "",
    note = "",
    updatedAt = today
  ): HoofRecord => ({ sizeMm, gait, nailPositions, shoeType, note, updatedAt });

  const released: FittingOrder = {
    id: "O-1001",
    horseId: "HORSE-18",
    farrier: "老陈",
    createdAt: addDays(today, -26),
    status: "released",
    hooves: {
      LF: hoof(124, "mild", "3·6·9 点位", "铝蹄铁", "右前蹄外侧磨耗观察中"),
      RF: hoof(124, "mild", "3·6·9 点位", "铝蹄铁", "外侧磨耗"),
      LH: hoof(120, "normal", "3·9 点位", "铝蹄铁"),
      RH: hoof(120, "normal", "3·9 点位", "铝蹄铁"),
    },
    allocations: [
      { hoof: "LF", sku: "AL-LF-124", shoeType: "铝蹄铁", sizeMm: 124, diffMm: 0 },
      { hoof: "RF", sku: "AL-RF-124", shoeType: "铝蹄铁", sizeMm: 124, diffMm: 0 },
      { hoof: "LH", sku: "AL-LH-120", shoeType: "铝蹄铁", sizeMm: 120, diffMm: 0 },
      { hoof: "RH", sku: "AL-RH-120", shoeType: "铝蹄铁", sizeMm: 120, diffMm: 0 },
    ],
    trialAt: addDays(today, -25),
    confirmations: [
      { by: "小周", at: addDays(today, -25) + "T09:20", stable: true },
      { by: "阿力", at: addDays(today, -25) + "T10:05", stable: true },
    ],
    releasedAt: addDays(today, -25),
    reviewDueAt: addDays(today, -4), // 轻微异常 21 天，已逾期 4 天
    releaseVersion: 1,
    photoNote: "磨耗面已拍照归档",
  };

  // 待领料：四蹄齐全，尺寸全部匹配，点领料即锁定
  const ready: FittingOrder = {
    id: "O-1002",
    horseId: "HORSE-27",
    farrier: "老陈",
    createdAt: addDays(today, -2),
    status: "ready",
    hooves: {
      LF: hoof(128, "normal", "3·6·9 点位", "加护蹄垫", "后蹄裂纹加垫"),
      RF: hoof(128, "normal", "3·6·9 点位", "加护蹄垫"),
      LH: hoof(128, "normal", "3·6·9 点位", "加护蹄垫"),
      RH: hoof(128, "normal", "3·6·9 点位", "加护蹄垫"),
    },
    allocations: [],
    confirmations: [],
    releaseVersion: 0,
    photoNote: "裂纹照片待拍",
  };

  // 试装确认中：已经一次稳定确认，还需换人再来一次
  const fitting: FittingOrder = {
    id: "O-1003",
    horseId: "HORSE-31",
    farrier: "小周",
    createdAt: addDays(today, -3),
    status: "fitting",
    hooves: {
      LF: hoof(128, "mild", "3·6·9 点位", "铝蹄铁", "步态轻微不稳"),
      RF: hoof(128, "normal", "3·6·9 点位", "铝蹄铁"),
      LH: hoof(124, "normal", "3·9 点位", "铝蹄铁"),
      RH: hoof(123, "normal", "3·9 点位", "铝蹄铁"),
    },
    allocations: [
      { hoof: "LF", sku: "AL-LF-128", shoeType: "铝蹄铁", sizeMm: 128, diffMm: 0 },
      { hoof: "RF", sku: "AL-RF-128", shoeType: "铝蹄铁", sizeMm: 128, diffMm: 0 },
      { hoof: "LH", sku: "AL-LH-124", shoeType: "铝蹄铁", sizeMm: 124, diffMm: 0 },
      { hoof: "RH", sku: "AL-RH-124", shoeType: "铝蹄铁", sizeMm: 124, diffMm: 1 },
    ],
    trialAt: addDays(today, -1),
    confirmations: [{ by: "阿力", at: addDays(today, -1) + "T16:00", stable: true }],
    releaseVersion: 0,
    photoNote: "教练需复核步态",
  };

  // 建档中：钉位未登记齐，领料入口应关闭
  const recording: FittingOrder = {
    id: "O-1004",
    horseId: "HORSE-44",
    farrier: "阿力",
    createdAt: addDays(today, -1),
    status: "recording",
    hooves: {
      ...emptyHooves(),
      LF: hoof(120, "normal", "3·9 点位", "铝蹄铁"),
      RF: hoof(120, "", "", "铝蹄铁", "右前待评估"),
    },
    allocations: [],
    confirmations: [],
    releaseVersion: 0,
    photoNote: "",
  };

  // 停待备料：右前实测 138，目录里最近的钢蹄铁 135，差 3mm > 2mm
  const awaitingFar: FittingOrder = {
    id: "O-1005",
    horseId: "HORSE-52",
    farrier: "老陈",
    createdAt: addDays(today, -4),
    status: "awaitingStock",
    hooves: {
      LF: hoof(132, "severe", "3·6·9·11 点位", "钢蹄铁", "明显跛行，缩短复查"),
      RF: hoof(138, "severe", "3·6·9·11 点位", "钢蹄铁", "蹄径偏大需备料"),
      LH: hoof(132, "mild", "3·6·9 点位", "钢蹄铁"),
      RH: hoof(132, "mild", "3·6·9 点位", "钢蹄铁"),
    },
    allocations: [],
    stockReason:
      "右前蹄实测 138mm，最近型号 钢蹄铁 135mm，尺寸差 3mm 超过 2mm，停待备料",
    confirmations: [],
    releaseVersion: 0,
    photoNote: "",
  };

  // 待领料：和 O-1003 一样要用 AL-RH-124，但该型号账面 1 只已锁 → 领用停待备料
  const contention: FittingOrder = {
    id: "O-1006",
    horseId: "HORSE-63",
    farrier: "阿力",
    createdAt: addDays(today, -1),
    status: "ready",
    hooves: {
      LF: hoof(128, "normal", "3·6·9 点位", "铝蹄铁"),
      RF: hoof(128, "normal", "3·6·9 点位", "铝蹄铁"),
      LH: hoof(124, "normal", "3·9 点位", "铝蹄铁"),
      RH: hoof(123, "normal", "3·9 点位", "铝蹄铁"),
    },
    allocations: [],
    confirmations: [],
    releaseVersion: 0,
    photoNote: "",
  };

  const orders = [released, ready, fitting, recording, awaitingFar, contention];

  const stock: { sku: string; qty: number }[] = [];
  for (const s of catalog) {
    // 加护蹄垫备 2 只，其余常规型号 4 只（135 大码随后按演示需要单独压低）
    const scarce = s.shoeType === "加护蹄垫" || s.sizeMm === 135;
    stock.push({ sku: s.sku, qty: scarce ? 2 : 4 });
  }
  // 把 O-1003 占用的 AL-RH-124 压到账面 1，制造锁后无可用
  const rh124 = stock.find((s) => s.sku === "AL-RH-124")!;
  rh124.qty = 1;

  return {
    version: 1,
    horses: [
      { id: "HORSE-18", category: "运动马" },
      { id: "HORSE-27", category: "运动马" },
      { id: "HORSE-31", category: "运动马" },
      { id: "HORSE-44", category: "休养马" },
      { id: "HORSE-52", category: "休养马" },
      { id: "HORSE-63", category: "运动马" },
    ],
    orders,
    shoeCatalog: catalog,
    stock,
    events: [
      {
        id: "E-SEED-1",
        at: addDays(today, -25) + "T10:05",
        type: "release",
        orderId: "O-1001",
        horseId: "HORSE-18",
        message: "O-1001 / HORSE-18 两次换人确认步态稳定，放行，复查日 " + released.reviewDueAt,
      },
      {
        id: "E-SEED-2",
        at: addDays(today, -4) + "T08:00",
        type: "requisitionStop",
        orderId: "O-1005",
        horseId: "HORSE-52",
        message: "O-1005 / HORSE-52 尺寸差超 2mm，停待备料",
      },
    ],
    requisitionInFlight: {},
  };
}
