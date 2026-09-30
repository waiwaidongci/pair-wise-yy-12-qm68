import { initialState } from "../src/seed";
import { reducer } from "../src/store";
import {
  addDays,
  canConfirm,
  isFourHoovesComplete,
  planRequisition,
} from "../src/domain";
import type { FittingOrder, GaitGrade, HoofId } from "../src/types";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

const now = new Date().toISOString();
let state = initialState();
const get = (id: string) => state.orders.find((o) => o.id === id)!;
const send = (action: Parameters<typeof reducer>[1]) => {
  state = reducer(state, action);
};

// 1. 一匹马最多一张未结束单：HORSE-18 已有 released
state = reducer(state, {
  type: "CREATE_ORDER",
  horseId: "HORSE-18",
  farrier: "测试师",
  at: now,
});
check("重复建档被拒（一匹马一张未结束单）", !state.orders.some((o) => o.farrier === "测试师"));

// 2. 四蹄未齐不能领料 —— 直接在 reducer 层：O-1004 是 recording
const planIncomplete = planRequisition(state, get("O-1004"));
check("建档中四蹄不齐", !isFourHoovesComplete(get("O-1004")));
check("不齐单不会出现成功领料方案", !planIncomplete.ok);

// 3. 正常领料：O-1002 四蹄齐全 → 原子提交后锁定
check("O-1002 四蹄齐全", isFourHoovesComplete(get("O-1002")));
send({ type: "REQUISITION_START", orderId: "O-1002" });
// 重复 START 无效（模拟第二次点击，thunk 层还会拦）
state = reducer(state, { type: "REQUISITION_START", orderId: "O-1002" });
check("重复 START 不改变 inFlight", state.requisitionInFlight["O-1002"] === true);
send({ type: "REQUISITION_COMMIT", orderId: "O-1002", at: now });
send({ type: "REQUISITION_END", orderId: "O-1002" });
check("O-1002 领料成功 → allocated", get("O-1002").status === "allocated");
check("四蹄铁全部锁定", get("O-1002").allocations.length === 4);
check("锁定型号尺寸差都 ≤2", get("O-1002").allocations.every((a) => a.diffMm <= 2));

// 4. 并发抢领：O-1003 已锁 AL-RH-124（账面1只）→ O-1006 同型号应停待备料
send({ type: "REQUISITION_START", orderId: "O-1006" });
send({ type: "REQUISITION_COMMIT", orderId: "O-1006", at: now });
check("并发后到的 O-1006 停待备料", get("O-1006").status === "awaitingStock");
check("原因指向先到的 O-1003", get("O-1006").stockReason?.includes("O-1003") ?? false);
check("后到者未锁住任何蹄铁", get("O-1006").allocations.length === 0);

// 5. 尺寸差 >2mm：O-1005 RF=138，最近135差3
check("O-1005 保持停待备料（超差3mm）", get("O-1005").status === "awaitingStock");
check("超差原因包含尺寸差", get("O-1005").stockReason?.includes("3mm") ?? false);
// 补一只 RF-138 钢蹄铁后应可重新领取
send({ type: "RESTOCK", sku: "ST-RF-138", qty: 1, at: now });
const replan = planRequisition(state, get("O-1005"), "O-1005");
check("补料后预检通过", replan.ok);
send({ type: "REQUISITION_START", orderId: "O-1005" });
send({ type: "REQUISITION_COMMIT", orderId: "O-1005", at: now });
check("补料后领料成功", get("O-1005").status === "allocated");

// 6. 换人连续两次确认 → 放行 + 复查日（O-1003 蹄铁师小周）
send({ type: "SET_TRIAL", orderId: "O-1003", at: now });
check("登记试装 → fitting", get("O-1003").status === "fitting");
// 本人确认被 canConfirm 拒绝（在 thunk 层，这里直接验证规则函数）
check("蹄铁师本人不能确认", canConfirm(get("O-1003"), "小周") !== null);
check("同一人连续第二次被拒", canConfirm({ ...get("O-1003"), farrier: "" }, "阿力") !== null);
// O-1003 第一次确认是阿力；第二位师傅小秦
send({ type: "ADD_CONFIRMATION", orderId: "O-1003", by: "小秦", stable: true, at: now });
check("换人第二次确认后放行", get("O-1003").status === "released");
const expectedDue = addDays(now.slice(0, 10), 21); // 最差步态 mild → 21天
check("复查日按最差步态重算（mild 21天）", get("O-1003").reviewDueAt === expectedDue,
  `got ${get("O-1003").reviewDueAt} want ${expectedDue}`);

// 7. 放行后修改任一蹄记录 → 失效 + 复查日清空 + 确认链清空
send({
  type: "UPDATE_HOOF",
  orderId: "O-1003",
  hoof: "LF",
  patch: { sizeMm: 129 },
  at: now,
});
check("放行后改记录 → releaseVoid", get("O-1003").status === "releaseVoid");
check("复查日已作废", !get("O-1003").reviewDueAt);
check("确认链清空", get("O-1003").confirmations.length === 0);
check("放行代数 +1", get("O-1003").releaseVersion === 1);
check("已锁蹄铁保留（重确认后复用）", get("O-1003").allocations.length === 4);
// 重新走试装+两人确认 → 重新放行重算
send({ type: "SET_TRIAL", orderId: "O-1003", at: now });
send({ type: "ADD_CONFIRMATION", orderId: "O-1003", by: "老陈", stable: true, at: now });
send({ type: "ADD_CONFIRMATION", orderId: "O-1003", by: "阿力", stable: true, at: now });
check("重新两次换人确认 → 再放行", get("O-1003").status === "released");
check("复查日重新生成", !!get("O-1003").reviewDueAt);

// 步态不稳 → 清空确认链退回
send({ type: "UPDATE_HOOF", orderId: "O-1003", hoof: "LH", patch: { gait: "severe" }, at: now });
send({ type: "SET_TRIAL", orderId: "O-1003", at: now });
send({ type: "ADD_CONFIRMATION", orderId: "O-1003", by: "老陈", stable: true, at: now });
send({ type: "ADD_CONFIRMATION", orderId: "O-1003", by: "小秦", stable: false, at: now });
check("步态不稳 → 退回 allocated", get("O-1003").status === "allocated");
check("不稳清空确认链", get("O-1003").confirmations.length === 0);
send({ type: "SET_TRIAL", orderId: "O-1003", at: now });
send({ type: "ADD_CONFIRMATION", orderId: "O-1003", by: "老陈", stable: true, at: now });
send({ type: "ADD_CONFIRMATION", orderId: "O-1003", by: "小秦", stable: true, at: now });
check("severe 复查周期 14 天", get("O-1003").reviewDueAt === addDays(now.slice(0, 10), 14));

// 8. 复查归档：扣账面库存、马空闲可再建单
const beforeQty = state.stock.find((s) => s.sku === "AL-LF-128")!.qty;
send({ type: "ARCHIVE_ORDER", orderId: "O-1003", at: now });
const afterQty = state.stock.find((s) => s.sku === "AL-LF-128")!.qty;
check("归档后蹄铁转实耗扣账面", afterQty === beforeQty - 1);
check("归档单不再锁定", get("O-1003").status === "completed" && get("O-1003").allocations.length === 0);
state = reducer(state, {
  type: "CREATE_ORDER",
  horseId: "HORSE-31",
  farrier: "测试师",
  at: now,
});
check("归档后该马可再建单", !!state.orders.find((o) => o.horseId === "HORSE-31" && o.status === "recording"));

// 9. 终止解锁退回
send({ type: "TERMINATE_ORDER", orderId: "O-1002", at: now });
check("终止单释放锁定", get("O-1002").allocations.length === 0 && get("O-1002").status === "terminated");

// 10. 履历是状态的一部分：事件数随操作增长
check("履历事件已累积", state.events.length > 4);
check("放行失效事件入履历", state.events.some((e) => e.type === "releaseVoid"));
check("重复领用拦截事件类型存在", (() => {
  state = reducer(state, { type: "REQUISITION_DUPLICATE", orderId: "O-1006", at: now });
  return state.events.some((e) => e.type === "duplicateReject");
})());

// 11. 完整走一张新单端到端（含 normal 42天）
state = reducer(state, { type: "CREATE_ORDER", horseId: "HORSE-99", farrier: "老陈", category: "运动马", at: now });
const newId = state.orders[0].id;
check("新单为建档中", get(newId).status === "recording");
for (const h of ["LF", "RF", "LH", "RH"] as HoofId[]) {
  send({
    type: "UPDATE_HOOF",
    orderId: newId,
    hoof: h,
    patch: { sizeMm: 124, gait: "normal" as GaitGrade, nailPositions: "3·9", shoeType: "铝蹄铁" },
    at: now,
  });
}
check("四蹄补齐 → ready", get(newId).status === "ready");
// 端到端新单先补足铝蹄铁 124（前序测试可能已把账面锁空）
for (const h of ["LF", "RF", "LH", "RH"] as HoofId[]) {
  send({ type: "RESTOCK", sku: `AL-${h}-124`, qty: 4, at: now });
}
send({ type: "REQUISITION_START", orderId: newId });
send({ type: "REQUISITION_COMMIT", orderId: newId, at: now });
check("新单领料成功", get(newId).status === "allocated");
send({ type: "SET_TRIAL", orderId: newId, at: now });
send({ type: "ADD_CONFIRMATION", orderId: newId, by: "阿力", stable: true, at: now });
send({ type: "ADD_CONFIRMATION", orderId: newId, by: "小周", stable: true, at: now });
check("新单两次换人后放行", get(newId).status === "released");
check("normal 复查周期 42 天", get(newId).reviewDueAt === addDays(now.slice(0, 10), 42));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
