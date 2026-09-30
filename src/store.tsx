import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AppState,
  EventType,
  FittingOrder,
  GaitGrade,
  HistoryEvent,
  HoofId,
  HoofRecord,
  ShoeSku,
  Toast,
} from "./types";
import {
  buildReviewDue,
  canConfirm,
  emptyHooves,
  GAIT_LABEL,
  HOOF_LABEL,
  isActive,
  isFourHoovesComplete,
  linesToAllocations,
  planRequisition,
} from "./domain";
import { initialState, STORAGE_KEY } from "./seed";

type Action =
  | {
      type: "CREATE_ORDER";
      horseId: string;
      farrier: string;
      category?: "运动马" | "休养马";
      at: string;
    }
  | {
      type: "UPDATE_HOOF";
      orderId: string;
      hoof: HoofId;
      patch: Partial<Omit<HoofRecord, "updatedAt">>;
      at: string;
    }
  | { type: "UPDATE_PHOTO_NOTE"; orderId: string; note: string }
  | { type: "REQUISITION_START"; orderId: string }
  | { type: "REQUISITION_COMMIT"; orderId: string; at: string }
  | { type: "REQUISITION_DUPLICATE"; orderId: string; at: string }
  | { type: "REQUISITION_END"; orderId: string }
  | { type: "SET_TRIAL"; orderId: string; at: string }
  | { type: "ADD_CONFIRMATION"; orderId: string; by: string; stable: boolean; at: string }
  | { type: "ARCHIVE_ORDER"; orderId: string; at: string }
  | { type: "TERMINATE_ORDER"; orderId: string; at: string }
  | { type: "RESTOCK"; sku: string; qty: number; at: string }
  | { type: "RESET" };

let eventSeq = 0;

/** 按 AL-RF-138 这类编号反查型号信息，用于备料新型号自动登记 */
function parseSku(sku: string): ShoeSku | null {
  const m = /^([A-Z]+)-(LF|RF|LH|RH)(?:-(\d+))?$/.exec(sku.trim());
  if (!m) return null;
  const typeMap: Record<string, string> = { AL: "铝蹄铁", ST: "钢蹄铁", PD: "加护蹄垫" };
  return {
    sku: sku.trim(),
    shoeType: typeMap[m[1]] ?? `${m[1]} 型蹄铁`,
    sizeMm: m[3] ? Number(m[3]) : 0,
    hoof: m[2] as HoofId,
  };
}

function makeEvent(
  type: EventType,
  message: string,
  at: string,
  ctx?: { orderId?: string; horseId?: string }
): HistoryEvent {
  eventSeq += 1;
  return {
    id: `E-${Date.now()}-${eventSeq}`,
    at,
    type,
    message,
    orderId: ctx?.orderId,
    horseId: ctx?.horseId,
  };
}

function patchOrder(state: AppState, orderId: string, fn: (o: FittingOrder) => FittingOrder) {
  state.orders = state.orders.map((o) => (o.id === orderId ? fn(o) : o));
}

const CONFIRMABLE: FittingOrder["status"][] = ["allocated", "fitting", "releaseVoid"];

export function reducer(prev: AppState, action: Action): AppState {
  const state: AppState = {
    ...prev,
    orders: prev.orders.map((o) => ({
      ...o,
      hooves: { ...o.hooves },
      allocations: [...o.allocations],
      confirmations: [...o.confirmations],
    })),
    stock: prev.stock.map((s) => ({ ...s })),
    events: [...prev.events],
    requisitionInFlight: { ...prev.requisitionInFlight },
  };
  const addEvent = (
    type: EventType,
    message: string,
    at: string,
    order?: FittingOrder
  ) => {
    state.events.push(
      makeEvent(type, message, at, order ? { orderId: order.id, horseId: order.horseId } : undefined)
    );
  };

  switch (action.type) {
    case "CREATE_ORDER": {
      if (state.orders.some((o) => o.horseId === action.horseId && isActive(o))) {
        return prev;
      }
      const maxNum = state.orders.reduce((m, o) => {
        const n = Number(o.id.replace("O-", ""));
        return Number.isFinite(n) && n > m ? n : m;
      }, 1000);
      const order: FittingOrder = {
        id: `O-${maxNum + 1}`,
        horseId: action.horseId,
        farrier: action.farrier.trim(),
        createdAt: action.at.slice(0, 10),
        status: "recording",
        hooves: emptyHooves(),
        allocations: [],
        confirmations: [],
        releaseVersion: 0,
        photoNote: "",
      };
      if (!state.horses.some((h) => h.id === action.horseId)) {
        state.horses = [
          ...state.horses,
          { id: action.horseId, category: action.category ?? "运动马" },
        ];
      }
      state.orders = [order, ...state.orders];
      addEvent("create", `新建适配单 ${order.id}（${order.horseId}，蹄铁师 ${order.farrier}）`, action.at, order);
      return state;
    }

    case "UPDATE_HOOF": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || ["completed", "terminated"].includes(order.status)) return prev;

      const before = order.hooves[action.hoof];
      const after: HoofRecord = {
        ...before,
        ...action.patch,
        updatedAt: action.at,
      };
      order.hooves[action.hoof] = after;
      addEvent(
        "hoofEdit",
        `${order.id} / ${order.horseId} 修改${HOOF_LABEL[action.hoof]}记录（尺寸 ${
          before.sizeMm === "" ? "未量" : before.sizeMm
        }→${after.sizeMm === "" ? "未量" : after.sizeMm}mm · 步态 ${
          before.gait ? GAIT_LABEL[before.gait as GaitGrade] : "未评"
        }→${after.gait ? GAIT_LABEL[after.gait as GaitGrade] : "未评"} · 钉位 ${
          before.nailPositions || "未登记"
        }→${after.nailPositions || "未登记"}）`,
        action.at,
        order
      );

      // 修改任一蹄记录：清空步态确认链，试装需重做
      order.confirmations = [];
      order.trialAt = undefined;

      if (order.status === "released") {
        // 原放行失效，重算复查日推迟到重新放行时
        order.status = "releaseVoid";
        order.releaseVersion += 1;
        order.releasedAt = undefined;
        order.reviewDueAt = undefined;
        addEvent(
          "releaseVoid",
          `${order.id} / ${order.horseId} 放行已失效（第 ${order.releaseVersion} 次），复查日作废，需换人连续两次重新确认`,
          action.at,
          order
        );
      } else if (order.status === "fitting" || order.status === "releaseVoid") {
        order.status = "allocated";
      } else if (order.status === "recording" || order.status === "ready") {
        order.status = isFourHoovesComplete(order) ? "ready" : "recording";
      }
      // awaitingStock / allocated 维持原状态，等待重新领料或重新试装
      return state;
    }

    case "UPDATE_PHOTO_NOTE": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return prev;
      order.photoNote = action.note;
      return state;
    }

    case "REQUISITION_START": {
      if (state.requisitionInFlight[action.orderId]) return prev;
      state.requisitionInFlight[action.orderId] = true;
      return state;
    }

    case "REQUISITION_DUPLICATE": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (order) {
        addEvent(
          "duplicateReject",
          `${order.id} / ${order.horseId} 重复领用请求被拦截，只保留先到的一笔`,
          action.at,
          order
        );
      }
      return state;
    }

    case "REQUISITION_COMMIT": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || !["ready", "awaitingStock"].includes(order.status)) return prev;
      // 提交瞬间重新基于最新状态做原子预演：别的单可能已经把蹄铁锁走
      const plan = planRequisition(state, order, order.id);
      if (plan.ok) {
        order.allocations = linesToAllocations(plan.lines);
        order.status = "allocated";
        order.stockReason = undefined;
        const detail = order.allocations
          .map((l) => `${HOOF_LABEL[l.hoof]} ${l.sku} ${l.sizeMm}mm`)
          .join("；");
        addEvent(
          "requisitionLocked",
          `${order.id} / ${order.horseId} 四蹄蹄铁领出并锁定：${detail}`,
          action.at,
          order
        );
      } else {
        order.allocations = [];
        order.status = "awaitingStock";
        order.stockReason = plan.reason;
        addEvent("requisitionStop", `${order.id} / ${order.horseId} ${plan.reason}`, action.at, order);
      }
      return state;
    }

    case "REQUISITION_END": {
      delete state.requisitionInFlight[action.orderId];
      return state;
    }

    case "SET_TRIAL": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || !CONFIRMABLE.includes(order.status)) return prev;
      order.trialAt = action.at;
      addEvent("trial", `${order.id} / ${order.horseId} 登记试装完成，等待换人连续两次步态确认`, action.at, order);
      if (order.status === "allocated") order.status = "fitting";
      return state;
    }

    case "ADD_CONFIRMATION": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || !CONFIRMABLE.includes(order.status)) return prev;
      if (!order.trialAt) return prev;

      if (!action.stable) {
        order.confirmations = [];
        order.status = "allocated";
        order.trialAt = undefined;
        addEvent(
          "confirmReset",
          `${order.id} / ${order.horseId} ${action.by} 确认步态不稳，确认链清空，需重新调整与试装`,
          action.at,
          order
        );
        return state;
      }

      order.confirmations = [
        ...order.confirmations,
        { by: action.by, at: action.at, stable: true },
      ];
      addEvent(
        "confirm",
        `${order.id} / ${order.horseId} 第 ${order.confirmations.length} 次步态稳定确认：${action.by}`,
        action.at,
        order
      );

      if (order.confirmations.length >= 2) {
        order.status = "released";
        order.releasedAt = action.at.slice(0, 10);
        order.reviewDueAt = buildReviewDue(action.at, order.hooves);
        const reRelease = order.releaseVersion > 0;
        addEvent(
          "release",
          `${order.id} / ${order.horseId} 换人连续两次确认步态稳定，${
            reRelease ? "重新" : ""
          }放行，复查日重算为 ${order.reviewDueAt}`,
          action.at,
          order
        );
      } else {
        order.status = "fitting";
      }
      return state;
    }

    case "ARCHIVE_ORDER": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || order.status !== "released") return prev;
      // 复查通过归档：锁定蹄铁转为实际消耗，账面库存扣减
      const used: Record<string, number> = {};
      for (const l of order.allocations) used[l.sku] = (used[l.sku] ?? 0) + 1;
      state.stock = state.stock.map((s) =>
        used[s.sku] ? { ...s, qty: Math.max(0, s.qty - used[s.sku]) } : s
      );
      order.allocations = [];
      order.status = "completed";
      order.completedAt = action.at.slice(0, 10);
      addEvent("reviewArchive", `${order.id} / ${order.horseId} 复查通过归档，适配单结束`, action.at, order);
      return state;
    }

    case "TERMINATE_ORDER": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || !isActive(order) || order.status === "released") return prev;
      order.allocations = []; // 未使用的蹄铁解除锁定，回到库存
      order.status = "terminated";
      order.terminatedAt = action.at.slice(0, 10);
      order.trialAt = undefined;
      order.confirmations = [];
      addEvent("terminate", `${order.id} / ${order.horseId} 适配单终止，已锁蹄铁退回库存`, action.at, order);
      return state;
    }

    case "RESTOCK": {
      const item = state.stock.find((s) => s.sku === action.sku);
      if (item) item.qty += action.qty;
      else state.stock = [...state.stock, { sku: action.sku, qty: action.qty }];
      // 备料入库的新型号同时登记进蹄铁目录，否则领料匹配不到
      if (!state.shoeCatalog.some((c) => c.sku === action.sku)) {
        const parsed = parseSku(action.sku);
        if (parsed) state.shoeCatalog = [...state.shoeCatalog, parsed];
      }
      addEvent("restock", `蹄铁 ${action.sku} 入库 +${action.qty}，停待备料单可重新领料`, action.at);
      return state;
    }

    case "RESET":
      return initialState();

    default:
      return prev;
  }
}

function init(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.orders)) return parsed;
    }
  } catch {
    // 损坏的存档直接回退种子
  }
  return initialState();
}

interface StoreApi {
  state: AppState;
  toasts: Toast[];
  createOrder: (
    horseId: string,
    farrier: string,
    category: "运动马" | "休养马"
  ) => boolean;
  updateHoof: (orderId: string, hoof: HoofId, patch: Partial<Omit<HoofRecord, "updatedAt">>) => void;
  updatePhotoNote: (orderId: string, note: string) => void;
  requisition: (orderId: string) => void;
  requisitionConcurrent: (orderIds: string[]) => void;
  setTrial: (orderId: string) => void;
  addConfirmation: (orderId: string, by: string, stable: boolean) => void;
  archiveOrder: (orderId: string) => void;
  terminateOrder: (orderId: string) => void;
  restock: (sku: string, qty: number) => void;
  reset: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

const REQUISITION_DELAY_MS = 600;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatchRaw] = useReducer(reducer, undefined, init);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [toasts, setToasts] = useState<Toast[]>([]);

  // 立即更新 ref，保证连续触发的异步领用提交时读到的是最新状态
  const dispatch = useCallback((action: Action) => {
    stateRef.current = reducer(stateRef.current, action);
    dispatchRaw(action);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储不可用时只影响持久化
    }
  }, [state]);

  const pushToast = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const createOrder = useCallback(
    (horseId: string, farrier: string, category: "运动马" | "休养马") => {
      if (!horseId.trim()) {
        pushToast("err", "请选择或填写马匹编号");
        return false;
      }
      if (!farrier.trim()) {
        pushToast("err", "请填写蹄铁师姓名");
        return false;
      }
      if (!/^[A-Za-z0-9-]+$/.test(horseId.trim())) {
        pushToast("err", "马匹编号仅支持字母、数字和连字符");
        return false;
      }
      const dup = stateRef.current.orders.some(
        (o) => o.horseId === horseId.trim() && isActive(o)
      );
      if (dup) {
        pushToast("err", `${horseId} 已有一张未结束适配单，一匹马最多一张`);
        return false;
      }
      dispatch({
        type: "CREATE_ORDER",
        horseId: horseId.trim(),
        farrier,
        category,
        at: new Date().toISOString(),
      });
      pushToast("ok", `已为 ${horseId} 建档，补齐四蹄记录后才能领料`);
      return true;
    },
    [dispatch, pushToast]
  );

  const updateHoof = useCallback(
    (orderId: string, hoof: HoofId, patch: Partial<Omit<HoofRecord, "updatedAt">>) => {
      const order = stateRef.current.orders.find((o) => o.id === orderId);
      if (!order) return;
      dispatch({ type: "UPDATE_HOOF", orderId, hoof, patch, at: new Date().toISOString() });
      if (order.status === "released") {
        pushToast("warn", "蹄记录已修改，原放行失效、复查日作废，请重新换人两次确认");
      } else {
        pushToast("ok", `${HOOF_LABEL[hoof]}记录已保存`);
      }
    },
    [dispatch, pushToast]
  );

  const updatePhotoNote = useCallback(
    (orderId: string, note: string) => dispatch({ type: "UPDATE_PHOTO_NOTE", orderId, note }),
    [dispatch]
  );

  const commitAfterDelay = useCallback(
    (orderId: string, delay: number) => {
      setTimeout(() => {
        const at = new Date().toISOString();
        dispatch({ type: "REQUISITION_COMMIT", orderId, at });
        dispatch({ type: "REQUISITION_END", orderId });
        const after = stateRef.current.orders.find((o) => o.id === orderId);
        if (!after) return;
        if (after.status === "allocated") {
          pushToast("ok", `${orderId} 四蹄蹄铁领出并锁定，可以安排试装`);
        } else if (after.status === "awaitingStock") {
          pushToast("err", `${orderId} 停待备料：${after.stockReason ?? "库存不足"}`);
        }
      }, delay);
    },
    [dispatch, pushToast]
  );

  const requisition = useCallback(
    (orderId: string) => {
      const s = stateRef.current;
      const order = s.orders.find((o) => o.id === orderId);
      if (!order) return;
      if (!["ready", "awaitingStock"].includes(order.status)) {
        pushToast("warn", `${orderId} 当前状态不能领料`);
        return;
      }
      if (!isFourHoovesComplete(order)) {
        pushToast("err", `${orderId} 四蹄尺寸、步态等级、钉位未齐全，不能领料`);
        return;
      }
      if (s.requisitionInFlight[orderId]) {
        dispatch({ type: "REQUISITION_DUPLICATE", orderId, at: new Date().toISOString() });
        pushToast("warn", `${orderId} 正在领用中，重复请求已拦截，只留先到的`);
        return;
      }
      dispatch({ type: "REQUISITION_START", orderId });
      pushToast("ok", `${orderId} 领用请求已受理，正在锁定库存…`);
      commitAfterDelay(orderId, REQUISITION_DELAY_MS);
    },
    [commitAfterDelay, dispatch, pushToast]
  );

  const requisitionConcurrent = useCallback(
    (orderIds: string[]) => {
      const s = stateRef.current;
      const targets = orderIds
        .map((id) => s.orders.find((o) => o.id === id))
        .filter(
          (o): o is FittingOrder =>
            !!o &&
            ["ready", "awaitingStock"].includes(o.status) &&
            isFourHoovesComplete(o) &&
            !s.requisitionInFlight[o.id]
        );
      if (targets.length < 2) {
        pushToast("warn", "至少需要两张齐全可领的适配单才能演示并发抢领");
        return;
      }
      for (const o of targets) {
        dispatch({ type: "REQUISITION_START", orderId: o.id });
      }
      pushToast("ok", `已同时发出 ${targets.length} 笔领用请求，提交时只成先到的一笔`);
      // 同一时刻到期：reducer 顺序提交天然形成 CAS，后到者看到的库存已被锁定
      targets.forEach((o, i) => commitAfterDelay(o.id, REQUISITION_DELAY_MS + i));
    },
    [commitAfterDelay, dispatch, pushToast]
  );

  const setTrial = useCallback(
    (orderId: string) => {
      const order = stateRef.current.orders.find((o) => o.id === orderId);
      if (!order) return;
      if (order.allocations.length !== 4) {
        pushToast("err", "四蹄蹄铁未全部锁定，不能登记试装");
        return;
      }
      dispatch({ type: "SET_TRIAL", orderId, at: new Date().toISOString() });
      pushToast("ok", "试装已登记，请换人连续两次确认步态稳定");
    },
    [dispatch, pushToast]
  );

  const addConfirmation = useCallback(
    (orderId: string, by: string, stable: boolean) => {
      const order = stateRef.current.orders.find((o) => o.id === orderId);
      if (!order) return;
      if (!order.trialAt) {
        pushToast("err", "请先登记试装，再做步态确认");
        return;
      }
      if (stable) {
        const err = canConfirm(order, by);
        if (err) {
          pushToast("err", err);
          return;
        }
      } else if (!by.trim()) {
        pushToast("err", "请填写确认人");
        return;
      }
      dispatch({ type: "ADD_CONFIRMATION", orderId, by: by.trim(), stable, at: new Date().toISOString() });
      const after = stateRef.current.orders.find((o) => o.id === orderId);
      if (!stable) {
        pushToast("warn", "步态不稳，确认链已清空，退回待试装");
      } else if (after?.status === "released") {
        pushToast("ok", `两次换人确认完成，已放行，复查日 ${after.reviewDueAt}`);
      } else {
        pushToast("ok", "第 1 次确认已记录，还需另一位师傅再确认一次");
      }
    },
    [dispatch, pushToast]
  );

  const archiveOrder = useCallback(
    (orderId: string) => {
      dispatch({ type: "ARCHIVE_ORDER", orderId, at: new Date().toISOString() });
      pushToast("ok", `${orderId} 复查通过，已归档`);
    },
    [dispatch, pushToast]
  );

  const terminateOrder = useCallback(
    (orderId: string) => {
      const order = stateRef.current.orders.find((o) => o.id === orderId);
      if (!order) return;
      if (order.status === "released") {
        pushToast("warn", "已放行的单请走复查归档，不能直接终止");
        return;
      }
      dispatch({ type: "TERMINATE_ORDER", orderId, at: new Date().toISOString() });
      pushToast("ok", `${orderId} 已终止，锁定蹄铁退回库存`);
    },
    [dispatch, pushToast]
  );

  const restock = useCallback(
    (sku: string, qty: number) => {
      if (!sku.trim() || qty <= 0) {
        pushToast("err", "请填写型号和正整数入库数量");
        return;
      }
      dispatch({ type: "RESTOCK", sku: sku.trim(), qty, at: new Date().toISOString() });
      pushToast("ok", `${sku} 入库 +${qty}`);
    },
    [dispatch, pushToast]
  );

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
    pushToast("ok", "已恢复演示台账");
  }, [dispatch, pushToast]);

  const api: StoreApi = {
    state,
    toasts,
    createOrder,
    updateHoof,
    updatePhotoNote,
    requisition,
    requisitionConcurrent,
    setTrial,
    addConfirmation,
    archiveOrder,
    terminateOrder,
    restock,
    reset,
  };

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
