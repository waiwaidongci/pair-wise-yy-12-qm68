import {
  State,
  FittingOrder,
  HoofPosition,
  HoofRecord,
  OrderStatus,
  GaitGrade,
  Shoe,
} from "./types";

export const DAY = 86400000;
export const RECHECK_INTERVAL_DAYS = 14; // 复查间隔 14 天
export const SIZE_TOLERANCE_MM = 2; // 尺寸差上限 2mm

export const HOOF_LIST: { key: HoofPosition; label: string; short: string }[] = [
  { key: "LF", label: "左前蹄", short: "左前" },
  { key: "RF", label: "右前蹄", short: "右前" },
  { key: "LH", label: "左后蹄", short: "左后" },
  { key: "RH", label: "右后蹄", short: "右后" },
];

export const GAIT_LABELS: Record<GaitGrade, string> = {
  normal: "正常",
  minor: "轻微不稳",
  lame: "异常跛行",
};

export const NAIL_POSITIONS = ["2号钉位", "3号钉位", "4号钉位", "5号钉位", "6号钉位"];

export const STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  draft: { label: "待完善", color: "#64748b" },
  ready_to_pick: { label: "待领料", color: "#2563eb" },
  waiting_material: { label: "待备料", color: "#dc2626" },
  material_picked: { label: "已领料", color: "#0891b2" },
  trial_fitting: { label: "试装中", color: "#d97706" },
  released: { label: "已放行", color: "#166534" },
  closed: { label: "已结束", color: "#475569" },
};

export type Action =
  | { type: "CREATE_ORDER"; horseId: string }
  | {
      type: "UPDATE_HOOF";
      orderId: string;
      hoof: HoofPosition;
      patch: Partial<Pick<HoofRecord, "size" | "gaitGrade" | "nailPosition">>;
    }
  | { type: "PICK_SHOE"; orderId: string; hoof: HoofPosition; shoeId: string }
  | { type: "AUTO_PICK"; orderId: string }
  | { type: "START_TRIAL"; orderId: string }
  | { type: "CONFIRM_TRIAL"; orderId: string; confirmerId: string; stable: boolean }
  | { type: "CLOSE_ORDER"; orderId: string }
  | { type: "RESTOCK"; shoe: { id: string; size: number; type: string } }
  | { type: "CLEAR_TOAST" };

function makeHoof(): HoofRecord {
  return { size: null, gaitGrade: null, nailPosition: "", updatedAt: 0 };
}

function createOrder(horseId: string, now: number): FittingOrder {
  return {
    id: `FO-${String(now).slice(-6)}-${horseId.slice(-2)}`,
    horseId,
    status: "draft",
    hooves: { LF: makeHoof(), RF: makeHoof(), LH: makeHoof(), RH: makeHoof() },
    shoes: {},
    trialFitterId: null,
    trialFitterName: null,
    trialFittingAt: null,
    confirmations: [],
    recheckDate: now + RECHECK_INTERVAL_DAYS * DAY,
    releasedAt: null,
    closedAt: null,
    createdAt: now,
    log: [{ at: now, text: "创建适配单，开始登记四蹄" }],
  };
}

function toast(state: State, type: "success" | "error", text: string): State {
  return { ...state, toast: { type, text, at: Date.now() } };
}

function allHoovesComplete(order: FittingOrder): boolean {
  return HOOF_LIST.every(
    (h) =>
      order.hooves[h.key].size != null &&
      order.hooves[h.key].gaitGrade != null &&
      order.hooves[h.key].nailPosition !== ""
  );
}

function allShoesLocked(order: FittingOrder): boolean {
  return HOOF_LIST.every((h) => order.shoes[h.key] != null);
}

// 连续稳定确认次数（从末尾数）
export function stableStreak(order: FittingOrder): number {
  let n = 0;
  for (let i = order.confirmations.length - 1; i >= 0; i--) {
    if (order.confirmations[i].stable) n++;
    else break;
  }
  return n;
}

// 是否达成「连续两次稳定 + 换人」放行条件
function hasReleaseStreak(order: FittingOrder): boolean {
  const c = order.confirmations;
  if (c.length < 2) return false;
  const a = c[c.length - 2];
  const b = c[c.length - 1];
  return a.stable && b.stable && a.confirmerId !== b.confirmerId;
}

function horseLabel(state: State, horseId: string): string {
  const h = state.horses.find((x) => x.id === horseId);
  return h ? `${h.id} ${h.name}` : horseId;
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "CREATE_ORDER": {
      const now = Date.now();
      const exists = state.orders.some(
        (o) => o.horseId === action.horseId && o.status !== "closed"
      );
      if (exists) {
        return toast(
          state,
          "error",
          `该马匹已有未结束的适配单，一匹马最多留一张未结束适配单`
        );
      }
      const order = createOrder(action.horseId, now);
      return {
        ...state,
        orders: [...state.orders, order],
        toast: { type: "success", text: `已为 ${horseLabel(state, action.horseId)} 创建适配单`, at: now },
      };
    }

    case "UPDATE_HOOF": {
      const now = Date.now();
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;

      const hoof = action.hoof;
      const prev = order.hooves[hoof];
      const nextHoof: HoofRecord = { ...prev, ...action.patch, updatedAt: now };
      const hooves = { ...order.hooves, [hoof]: nextHoof };

      let status: OrderStatus = order.status;
      let confirmations = order.confirmations;
      let recheckDate = order.recheckDate;
      const log = [...order.log];
      const hLabel = HOOF_LIST.find((h) => h.key === hoof)!.label;

      // 规则：修改任一蹄记录，原放行失效
      if (status === "released") {
        status = "trial_fitting";
        confirmations = [];
        log.push({ at: now, text: `修改${hLabel}记录，原放行失效，需重新试装确认` });
      }

      // 规则：四蹄尺寸、步态等级、钉位齐全后才能领料
      if (status === "draft" && allHoovesComplete({ ...order, hooves })) {
        status = "ready_to_pick";
        log.push({ at: now, text: "四蹄尺寸、步态等级、钉位齐全，可领料" });
      }

      // 规则：修改蹄记录即重算复查日（以本次变更日为起点）
      recheckDate = now + RECHECK_INTERVAL_DAYS * DAY;
      log.push({ at: now, text: `复查日已重算为 ${fmtDate(recheckDate)}（修改${hLabel}）` });

      const next: FittingOrder = {
        ...order,
        hooves,
        status,
        confirmations,
        recheckDate,
        log,
      };
      return {
        ...state,
        orders: state.orders.map((o) => (o.id === order.id ? next : o)),
        toast: { type: "success", text: `${hLabel}记录已更新，复查日已重算`, at: now },
      };
    }

    case "PICK_SHOE": {
      const now = Date.now();
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;
      if (order.status === "closed") return toast(state, "error", "适配单已结束，不能领料");
      if (order.status !== "ready_to_pick" && order.status !== "waiting_material") {
        return toast(state, "error", "当前状态不可领料，请先补齐四蹄或完成试装");
      }
      const hoofRec = order.hooves[action.hoof];
      if (hoofRec.size == null) {
        return toast(state, "error", `${HOOF_LIST.find((h) => h.key === action.hoof)!.label}尺寸未填，不能领料`);
      }
      const shoe = state.shoes.find((s) => s.id === action.shoeId);
      if (!shoe) return state;

      // 规则：库存蹄铁领出即锁定；重复或并发领用只留先到的
      if (shoe.lockedBy && shoe.lockedBy !== order.id) {
        return toast(
          state,
          "error",
          `蹄铁 ${shoe.id} 已被其他适配单锁定（先到先得），本次领用无效`
        );
      }

      const diff = Math.abs(shoe.size - hoofRec.size);
      // 规则：尺寸差超过 2mm 就停待备料
      if (diff > SIZE_TOLERANCE_MM) {
        const log = [
          ...order.log,
          {
            at: now,
            text: `${HOOF_LIST.find((h) => h.key === action.hoof)!.label}领用 ${shoe.id}（${shoe.size}mm）与蹄尺寸 ${hoofRec.size}mm 差 ${diff}mm 超 ${SIZE_TOLERANCE_MM}mm，停待备料`,
          },
        ];
        return {
          ...state,
          orders: state.orders.map((o) =>
            o.id === order.id ? { ...o, status: "waiting_material" as OrderStatus, log } : o
          ),
          toast: { type: "error", text: `尺寸差 ${diff}mm 超 ${SIZE_TOLERANCE_MM}mm，已停待备料`, at: now },
        };
      }

      const invShoes = state.shoes.map((s) =>
        s.id === shoe.id ? { ...s, lockedBy: order.id } : s
      );
      const orderShoes = { ...order.shoes, [action.hoof]: shoe.id };
      let status: OrderStatus = order.status;
      const log = [
        ...order.log,
        {
          at: now,
          text: `${HOOF_LIST.find((h) => h.key === action.hoof)!.label}领用蹄铁 ${shoe.id}（${shoe.size}mm）已锁定`,
        },
      ];
      if (allShoesLocked({ ...order, shoes: orderShoes })) {
        status = "material_picked";
        log.push({ at: now, text: "四蹄蹄铁齐全，已领料，可进行试装" });
      } else if (status === "waiting_material") {
        status = "ready_to_pick";
      }
      return {
        ...state,
        shoes: invShoes,
        orders: state.orders.map((o) =>
          o.id === order.id ? { ...o, shoes: orderShoes, status, log } : o
        ),
        toast: { type: "success", text: `已锁定蹄铁 ${shoe.id}（先到先得，领出即锁定）`, at: now },
      };
    }

    case "AUTO_PICK": {
      const now = Date.now();
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;
      if (order.status !== "ready_to_pick" && order.status !== "waiting_material") {
        return toast(state, "error", "当前状态不可领料");
      }
      let invShoes = state.shoes;
      let orderShoes: typeof order.shoes = { ...order.shoes };
      let status: OrderStatus = order.status;
      const log = [...order.log];
      let blocked = false;

      for (const h of HOOF_LIST) {
        if (orderShoes[h.key]) continue;
        const hoofRec = order.hooves[h.key];
        if (hoofRec.size == null) continue;
        // 找未锁定且尺寸最接近的蹄铁
        const candidates = invShoes
          .filter((s) => !s.lockedBy || s.lockedBy === order.id)
          .map((s) => ({ s, diff: Math.abs(s.size - hoofRec.size!) }))
          .sort((a, b) => a.diff - b.diff);
        const best = candidates[0];
        if (!best || best.diff > SIZE_TOLERANCE_MM) {
          blocked = true;
          log.push({
            at: now,
            text: `${h.label}未找到差在 ${SIZE_TOLERANCE_MM}mm 内的蹄铁，停待备料`,
          });
          continue;
        }
        if (best.s.lockedBy && best.s.lockedBy !== order.id) {
          blocked = true;
          log.push({ at: now, text: `${h.label}选中的蹄铁已被锁定（先到先得），停待备料` });
          continue;
        }
        invShoes = invShoes.map((s) =>
          s.id === best.s.id ? { ...s, lockedBy: order.id } : s
        );
        orderShoes = { ...orderShoes, [h.key]: best.s.id };
        log.push({ at: now, text: `${h.label}领用蹄铁 ${best.s.id}（${best.s.size}mm）已锁定` });
      }

      if (blocked) {
        status = "waiting_material";
      } else if (allShoesLocked({ ...order, shoes: orderShoes })) {
        status = "material_picked";
        log.push({ at: now, text: "四蹄蹄铁齐全，已领料，可进行试装" });
      } else {
        status = "ready_to_pick";
      }
      return {
        ...state,
        shoes: invShoes,
        orders: state.orders.map((o) =>
          o.id === order.id ? { ...o, shoes: orderShoes, status, log } : o
        ),
        toast: blocked
          ? { type: "error", text: "部分蹄位缺料或尺寸差超 2mm，已停待备料", at: now }
          : { type: "success", text: "四蹄蹄铁已匹配锁定", at: now },
      };
    }

    case "START_TRIAL": {
      const now = Date.now();
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;
      if (order.status !== "material_picked") {
        return toast(state, "error", "已领料后才能开始试装");
      }
      const fitter = state.staff.find((s) => s.id === state.currentUserId);
      const log = [
        ...order.log,
        { at: now, text: `开始试装（试装人：${fitter?.name ?? "蹄铁师"}），试装后需换人确认` },
      ];
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === order.id
            ? {
                ...o,
                status: "trial_fitting" as OrderStatus,
                trialFitterId: state.currentUserId,
                trialFitterName: fitter?.name ?? "蹄铁师",
                trialFittingAt: now,
                log,
              }
            : o
        ),
        toast: { type: "success", text: "已开始试装，请换人确认步态", at: now },
      };
    }

    case "CONFIRM_TRIAL": {
      const now = Date.now();
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;
      if (order.status !== "trial_fitting") {
        return toast(state, "error", "仅试装中可确认步态");
      }
      const confirmer = state.staff.find((s) => s.id === action.confirmerId);
      if (!confirmer) return state;

      // 规则：试装后换人确认（试装人不能确认）
      if (order.trialFitterId && confirmer.id === order.trialFitterId) {
        return toast(state, "error", "试装人不能确认本单，需换人确认步态");
      }
      const last = order.confirmations[order.confirmations.length - 1];
      if (last && last.confirmerId === confirmer.id) {
        return toast(state, "error", "连续确认需换人，请换一位确认人");
      }

      const confirmation = {
        confirmerId: confirmer.id,
        confirmerName: confirmer.name,
        stable: action.stable,
        at: now,
      };
      const confirmations = [...order.confirmations, confirmation];
      let status: OrderStatus = order.status;
      let recheckDate = order.recheckDate;
      let releasedAt = order.releasedAt;
      const log = [...order.log];

      if (action.stable) {
        if (hasReleaseStreak({ ...order, confirmations })) {
          status = "released";
          releasedAt = now;
          recheckDate = now + RECHECK_INTERVAL_DAYS * DAY;
          const a = confirmations[confirmations.length - 2];
          const b = confirmations[confirmations.length - 1];
          log.push({
            at: now,
            text: `连续 2 次确认步态稳定（${a.confirmerName}、${b.confirmerName} 换人），适配单放行，复查日重算`,
          });
        } else {
          log.push({
            at: now,
            text: `${confirmer.name} 确认步态稳定（已连续 ${stableStreak({ ...order, confirmations })} 次，需连续 2 次且换人）`,
          });
        }
      } else {
        log.push({
          at: now,
          text: `${confirmer.name} 确认步态不稳定，连续计数清零，需重新换人确认`,
        });
      }

      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === order.id
            ? { ...o, confirmations, status, recheckDate, releasedAt, log }
            : o
        ),
        toast:
          status === "released"
            ? { type: "success", text: "连续两次换人确认步态稳定，适配单已放行", at: now }
            : { type: "success", text: "已记录步态确认", at: now },
      };
    }

    case "CLOSE_ORDER": {
      const now = Date.now();
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;
      if (order.status !== "released") {
        return toast(state, "error", "仅已放行适配单可结束并归入履历");
      }
      const log = [...order.log, { at: now, text: "适配单结束，归入蹄铁更换履历" }];
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === order.id ? { ...o, status: "closed" as OrderStatus, closedAt: now, log } : o
        ),
        toast: { type: "success", text: "适配单已结束，归入履历", at: now },
      };
    }

    case "RESTOCK": {
      const now = Date.now();
      if (state.shoes.some((s) => s.id === action.shoe.id)) {
        return toast(state, "error", "蹄铁编号已存在");
      }
      const shoe: Shoe = { ...action.shoe, lockedBy: null };
      return {
        ...state,
        shoes: [...state.shoes, shoe],
        toast: { type: "success", text: `已补货蹄铁 ${shoe.id}（${shoe.size}mm）`, at: now },
      };
    }

    case "CLEAR_TOAST":
      return { ...state, toast: null };

    default:
      return state;
  }
}

// ---------- 选择器：列表 / 提醒 / 履历 共用同一状态 ----------

export function selectOpenOrders(state: State): FittingOrder[] {
  return state.orders
    .filter((o) => o.status !== "closed")
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function selectHistory(state: State): FittingOrder[] {
  return state.orders
    .filter((o) => o.status === "closed")
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
}

export interface Reminder {
  key: string;
  orderId: string;
  horseId: string;
  kind: "draft" | "pick" | "material" | "confirm" | "recheck";
  title: string;
  detail: string;
  tone: "gray" | "blue" | "red" | "amber" | "green";
}

export function selectReminders(state: State, now: number): Reminder[] {
  const list: Reminder[] = [];
  for (const o of state.orders) {
    if (o.status === "closed") continue;
    const horse = state.horses.find((h) => h.id === o.horseId);
    const horseName = horse ? `${horse.id} ${horse.name}` : o.horseId;
    if (o.status === "draft") {
      list.push({
        key: `draft-${o.id}`,
        orderId: o.id,
        horseId: o.horseId,
        kind: "draft",
        title: `${horseName} 待完善四蹄`,
        detail: "四蹄尺寸、步态等级、钉位齐全后才能领料",
        tone: "gray",
      });
    } else if (o.status === "ready_to_pick") {
      list.push({
        key: `pick-${o.id}`,
        orderId: o.id,
        horseId: o.horseId,
        kind: "pick",
        title: `${horseName} 待领料`,
        detail: "四蹄已齐全，请领用并锁定蹄铁",
        tone: "blue",
      });
    } else if (o.status === "waiting_material") {
      list.push({
        key: `material-${o.id}`,
        orderId: o.id,
        horseId: o.horseId,
        kind: "material",
        title: `${horseName} 待备料`,
        detail: "蹄铁尺寸差超 2mm 或缺料，停待备料",
        tone: "red",
      });
    } else if (o.status === "trial_fitting") {
      list.push({
        key: `confirm-${o.id}`,
        orderId: o.id,
        horseId: o.horseId,
        kind: "confirm",
        title: `${horseName} 待换人确认步态`,
        detail: "试装后需换人连续两次确认步态稳定",
        tone: "amber",
      });
    } else if (o.status === "released" && o.recheckDate) {
      const days = Math.ceil((o.recheckDate - now) / DAY);
      if (days <= 3) {
        list.push({
          key: `recheck-${o.id}`,
          orderId: o.id,
          horseId: o.horseId,
          kind: "recheck",
          title: days < 0 ? `${horseName} 已逾期 ${-days} 天复查` : `${horseName} ${days} 天后复查`,
          detail: `复查日 ${fmtDate(o.recheckDate)}`,
          tone: days < 0 ? "red" : "green",
        });
      }
    }
  }
  const order: Record<Reminder["kind"], number> = {
    recheck: 0,
    material: 1,
    confirm: 2,
    pick: 3,
    draft: 4,
  };
  return list.sort((a, b) => order[a.kind] - order[b.kind]);
}

export function fmtDate(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDateTime(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${fmtDate(ts)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------- 种子数据 ----------

export function initialState(): State {
  const now = Date.now();
  const staff = [
    { id: "S1", name: "王蹄铁" },
    { id: "S2", name: "李教练" },
    { id: "S3", name: "张师傅" },
    { id: "S4", name: "赵助理" },
  ];
  const horses = [
    { id: "HORSE-18", name: "闪电", usage: "sport" as const },
    { id: "HORSE-27", name: "灰风", usage: "rest" as const },
    { id: "HORSE-31", name: "赤兔", usage: "sport" as const },
    { id: "HORSE-45", name: "青骓", usage: "sport" as const },
  ];
  const shoes: Shoe[] = [
    { id: "X-118", size: 118, type: "铝蹄铁", lockedBy: null },
    { id: "X-120", size: 120, type: "铝蹄铁", lockedBy: null },
    { id: "X-122", size: 122, type: "钢蹄铁", lockedBy: null },
    { id: "X-124", size: 124, type: "铝蹄铁", lockedBy: null },
    { id: "X-126", size: 126, type: "钢蹄铁", lockedBy: null },
    { id: "X-128", size: 128, type: "铝蹄铁", lockedBy: null },
    { id: "X-130", size: 130, type: "钢蹄铁", lockedBy: null },
    { id: "X-120B", size: 120, type: "铝蹄铁", lockedBy: null },
  ];

  const hoof = (size: number, grade: GaitGrade, nail: string, at: number): HoofRecord => ({
    size,
    gaitGrade: grade,
    nailPosition: nail,
    updatedAt: at,
  });

  // HORSE-18 待完善（只填了前蹄）
  const draft = createOrder("HORSE-18", now - 2 * DAY);
  draft.hooves.LF = hoof(120, "normal", "3号钉位", now - 2 * DAY);
  draft.hooves.RF = hoof(120, "normal", "3号钉位", now - 2 * DAY);
  draft.log = [
    ...draft.log,
    { at: now - 2 * DAY, text: "登记左前、右前蹄（120mm / 正常 / 3号钉位）" },
  ];

  // HORSE-27 已放行，复查日 2 天后（进入待复查提醒）
  const released = createOrder("HORSE-27", now - 16 * DAY);
  released.status = "released";
  released.hooves = {
    LF: hoof(124, "normal", "4号钉位", now - 16 * DAY),
    RF: hoof(124, "normal", "4号钉位", now - 16 * DAY),
    LH: hoof(124, "normal", "4号钉位", now - 16 * DAY),
    RH: hoof(124, "normal", "4号钉位", now - 16 * DAY),
  };
  released.shoes = { LF: "X-124", RF: "X-124", LH: "X-124", RH: "X-124" };
  released.trialFitterId = "S1";
  released.trialFitterName = "王蹄铁";
  released.trialFittingAt = now - 16 * DAY;
  released.confirmations = [
    { confirmerId: "S2", confirmerName: "李教练", stable: true, at: now - 16 * DAY },
    { confirmerId: "S3", confirmerName: "张师傅", stable: true, at: now - 16 * DAY },
  ];
  released.releasedAt = now - 16 * DAY;
  released.recheckDate = now + 2 * DAY;
  released.log = [
    { at: now - 16 * DAY, text: "创建适配单" },
    { at: now - 16 * DAY, text: "四蹄齐全，领料" },
    { at: now - 16 * DAY, text: "试装完成" },
    { at: now - 16 * DAY, text: "连续 2 次换人确认步态稳定，适配单放行" },
    { at: now - 16 * DAY, text: `复查日重算为 ${fmtDate(released.recheckDate)}` },
  ];
  shoes.find((s) => s.id === "X-124")!.lockedBy = released.id;

  // HORSE-31 待备料（蹄尺寸 123，试领 120 差 3mm 超 2mm）
  const waiting = createOrder("HORSE-31", now - 1 * DAY);
  waiting.status = "waiting_material";
  waiting.hooves = {
    LF: hoof(123, "minor", "3号钉位", now - 1 * DAY),
    RF: hoof(123, "minor", "3号钉位", now - 1 * DAY),
    LH: hoof(123, "normal", "3号钉位", now - 1 * DAY),
    RH: hoof(123, "normal", "3号钉位", now - 1 * DAY),
  };
  waiting.recheckDate = now - 1 * DAY + RECHECK_INTERVAL_DAYS * DAY;
  waiting.log = [
    { at: now - 1 * DAY, text: "创建适配单" },
    { at: now - 1 * DAY, text: "四蹄齐全，可领料" },
    { at: now - 1 * DAY, text: "领用 X-120（120mm）与蹄尺寸 123mm 差 3mm 超 2mm，停待备料" },
  ];

  // HORSE-45 试装中（已确认 1 次稳定，需再换人确认 1 次）
  const trial = createOrder("HORSE-45", now - 3 * DAY);
  trial.status = "trial_fitting";
  trial.hooves = {
    LF: hoof(122, "normal", "3号钉位", now - 3 * DAY),
    RF: hoof(122, "normal", "3号钉位", now - 3 * DAY),
    LH: hoof(122, "normal", "3号钉位", now - 3 * DAY),
    RH: hoof(122, "normal", "3号钉位", now - 3 * DAY),
  };
  trial.shoes = { LF: "X-122", RF: "X-122", LH: "X-122", RH: "X-122" };
  trial.trialFitterId = "S1";
  trial.trialFitterName = "王蹄铁";
  trial.trialFittingAt = now - 3 * DAY;
  trial.confirmations = [
    { confirmerId: "S2", confirmerName: "李教练", stable: true, at: now - 3 * DAY },
  ];
  trial.recheckDate = now - 3 * DAY + RECHECK_INTERVAL_DAYS * DAY;
  trial.log = [
    { at: now - 3 * DAY, text: "创建适配单" },
    { at: now - 3 * DAY, text: "四蹄齐全，领料" },
    { at: now - 3 * DAY, text: "领用蹄铁已锁定" },
    { at: now - 3 * DAY, text: "试装完成，待换人确认" },
    { at: now - 3 * DAY, text: "李教练 确认步态稳定（需连续 2 次且换人）" },
  ];
  shoes.find((s) => s.id === "X-122")!.lockedBy = trial.id;

  // HORSE-18 历史已结束单
  const closed = createOrder("HORSE-18", now - 76 * DAY);
  closed.status = "closed";
  closed.hooves = {
    LF: hoof(120, "normal", "3号钉位", now - 76 * DAY),
    RF: hoof(120, "normal", "3号钉位", now - 76 * DAY),
    LH: hoof(120, "normal", "3号钉位", now - 76 * DAY),
    RH: hoof(120, "normal", "3号钉位", now - 76 * DAY),
  };
  closed.shoes = { LF: "X-120B", RF: "X-120B", LH: "X-120B", RH: "X-120B" };
  closed.trialFitterId = "S1";
  closed.trialFitterName = "王蹄铁";
  closed.trialFittingAt = now - 76 * DAY;
  closed.confirmations = [
    { confirmerId: "S2", confirmerName: "李教练", stable: true, at: now - 76 * DAY },
    { confirmerId: "S3", confirmerName: "张师傅", stable: true, at: now - 76 * DAY },
  ];
  closed.releasedAt = now - 76 * DAY;
  closed.closedAt = now - 60 * DAY;
  closed.recheckDate = now - 62 * DAY;
  closed.log = [
    { at: now - 76 * DAY, text: "创建适配单" },
    { at: now - 76 * DAY, text: "四蹄齐全，领料" },
    { at: now - 76 * DAY, text: "试装完成" },
    { at: now - 76 * DAY, text: "连续 2 次换人确认步态稳定，放行" },
    { at: now - 60 * DAY, text: "适配单结束，归入履历" },
  ];
  shoes.find((s) => s.id === "X-120B")!.lockedBy = closed.id;

  return {
    horses,
    staff,
    shoes,
    currentUserId: "S1",
    orders: [draft, released, waiting, trial, closed],
    toast: null,
  };
}
