import { reducer, initialState, selectReminders, HOOF_LIST, DAY, RECHECK_INTERVAL_DAYS } from "../src/store";
import { State, FittingOrder } from "../src/types";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ ${msg}`);
  }
}

function findOrder(state: State, horseId: string): FittingOrder {
  const o = state.orders.find((o) => o.horseId === horseId && o.status !== "closed");
  if (!o) throw new Error(`no open order for ${horseId}`);
  return o;
}

function fillAllHooves(state: State, orderId: string, size = 120) {
  let s = state;
  for (const h of HOOF_LIST) {
    s = reducer(s, {
      type: "UPDATE_HOOF",
      orderId,
      hoof: h.key,
      patch: { size, gaitGrade: "normal", nailPosition: "3号钉位" },
    });
  }
  return s;
}

console.log("规则1：一匹马最多留一张未结束适配单");
{
  let s = initialState();
  const before = s.orders.length;
  s = reducer(s, { type: "CREATE_ORDER", horseId: "HORSE-18" });
  assert(s.orders.length === before, "已有未结束适配单时新建被拒绝");
  assert(s.toast?.type === "error", "返回错误提示");
}

console.log("规则2：四蹄齐全后才能领料");
{
  let s = initialState();
  const order = findOrder(s, "HORSE-18");
  assert(order.status === "draft", "初始为待完善");
  s = reducer(s, { type: "PICK_SHOE", orderId: order.id, hoof: "LF", shoeId: "X-120" });
  assert(s.toast?.type === "error", "待完善状态不能领料");
  s = fillAllHooves(s, order.id, 120);
  const updated = s.orders.find((o) => o.id === order.id)!;
  assert(updated.status === "ready_to_pick", "四蹄尺寸/步态/钉位齐全后转为待领料");
}

console.log("规则3：库存蹄铁领出即锁定，先到先得");
{
  let s = initialState();
  const o18 = findOrder(s, "HORSE-18");
  s = fillAllHooves(s, o18.id, 120);
  const o31 = findOrder(s, "HORSE-31"); // waiting_material，可领料
  // HORSE-18 先领 X-120
  s = reducer(s, { type: "PICK_SHOE", orderId: o18.id, hoof: "LF", shoeId: "X-120" });
  assert(s.toast?.type === "success", "HORSE-18 领用 X-120 成功");
  const shoe = s.shoes.find((x) => x.id === "X-120")!;
  assert(shoe.lockedBy === o18.id, "X-120 领出即锁定到 HORSE-18 适配单");
  // HORSE-31 并发领同一只 X-120
  s = reducer(s, { type: "PICK_SHOE", orderId: o31.id, hoof: "LF", shoeId: "X-120" });
  assert(s.toast?.type === "error" && s.toast.text.includes("先到先得"), "重复/并发领用只留先到的");
  const shoe2 = s.shoes.find((x) => x.id === "X-120")!;
  assert(shoe2.lockedBy === o18.id, "X-120 仍锁定给先到者，未被后到者领走");
}

console.log("规则4：尺寸差超过 2mm 停待备料");
{
  let s = initialState();
  const o18 = findOrder(s, "HORSE-18");
  s = fillAllHooves(s, o18.id, 120);
  // X-126 库存未锁定，与 120mm 蹄尺寸差 6mm
  s = reducer(s, { type: "PICK_SHOE", orderId: o18.id, hoof: "LF", shoeId: "X-126" });
  assert(s.toast?.type === "error", "尺寸差 6mm 超 2mm 被拒");
  const o = s.orders.find((x) => x.id === o18.id)!;
  assert(o.status === "waiting_material", "转为待备料");
  assert(!o.shoes.LF, "未锁定任何蹄铁");
  // 改领 120mm 后恢复
  s = reducer(s, { type: "PICK_SHOE", orderId: o18.id, hoof: "LF", shoeId: "X-120" });
  const o2 = s.orders.find((x) => x.id === o18.id)!;
  assert(o2.shoes.LF === "X-120", "改配合尺寸后解锁成功");
}

console.log("规则5：试装后换人连续两次确认步态稳定才放行");
{
  let s = initialState();
  const o45 = findOrder(s, "HORSE-45");
  assert(o45.status === "trial_fitting", "HORSE-45 试装中，已有 1 次稳定确认");
  // 试装人 S1 不能确认
  s = reducer(s, { type: "CONFIRM_TRIAL", orderId: o45.id, confirmerId: "S1", stable: true });
  assert(s.toast?.type === "error" && s.toast.text.includes("换人"), "试装人不能确认，需换人");
  // 同一确认人连续确认被拒
  s = reducer(s, { type: "CONFIRM_TRIAL", orderId: o45.id, confirmerId: "S2", stable: true });
  assert(s.toast?.type === "error" && s.toast.text.includes("换人"), "连续确认需换人");
  // 换人 S3 再确认稳定
  s = reducer(s, { type: "CONFIRM_TRIAL", orderId: o45.id, confirmerId: "S3", stable: true });
  const o = s.orders.find((x) => x.id === o45.id)!;
  assert(o.status === "released", "连续两次换人确认稳定 → 放行");
  assert(o.releasedAt != null, "记录放行时间");
  // 不稳定会清零
  let s2 = initialState();
  const o45b = findOrder(s2, "HORSE-45");
  s2 = reducer(s2, { type: "CONFIRM_TRIAL", orderId: o45b.id, confirmerId: "S3", stable: false });
  const ob = s2.orders.find((x) => x.id === o45b.id)!;
  assert(ob.status === "trial_fitting", "确认不稳定不放行，连续计数清零");
}

console.log("规则6：修改任一蹄记录让原放行失效并重算复查日");
{
  let s = initialState();
  const o27 = findOrder(s, "HORSE-27");
  assert(o27.status === "released", "HORSE-27 已放行");
  const beforeRecheck = o27.recheckDate!;
  s = reducer(s, { type: "UPDATE_HOOF", orderId: o27.id, hoof: "LF", patch: { size: 121 } });
  const o = s.orders.find((x) => x.id === o27.id)!;
  assert(o.status === "trial_fitting", "放行后改蹄记录 → 放行失效，回到试装中");
  assert(o.confirmations.length === 0, "原确认记录清空，需重新换人确认");
  assert(o.recheckDate! > beforeRecheck, "复查日重算（延后）");
  assert(o.log.some((l) => l.text.includes("原放行失效")), "日志记录放行失效");
  assert(o.log.some((l) => l.text.includes("复查日已重算")), "日志记录复查日重算");
}

console.log("规则7：列表、提醒、履历共用同一状态");
{
  let s = initialState();
  const reminders = selectReminders(s, Date.now());
  const kinds = new Set(reminders.map((r) => r.kind));
  assert(kinds.has("draft"), "提醒含待完善（HORSE-18）");
  assert(kinds.has("material"), "提醒含待备料（HORSE-31）");
  assert(kinds.has("confirm"), "提醒含待换人确认（HORSE-45）");
  assert(kinds.has("recheck"), "提醒含待复查（HORSE-27）");
  const open = s.orders.filter((o) => o.status !== "closed");
  const history = s.orders.filter((o) => o.status === "closed");
  assert(open.length === 4, "列表：4 张未结束适配单");
  assert(history.length === 1 && history[0].horseId === "HORSE-18", "履历：HORSE-18 历史单");
  // 状态变更后提醒同步变化：HORSE-31 补货 123mm 后四蹄匹配领料，待备料提醒消失
  const o31 = findOrder(s, "HORSE-31");
  s = reducer(s, { type: "RESTOCK", shoe: { id: "X-123", size: 123, type: "铝蹄铁" } });
  s = reducer(s, { type: "AUTO_PICK", orderId: o31.id });
  const o31after = s.orders.find((x) => x.id === o31.id)!;
  assert(o31after.status === "material_picked", "补货后四蹄匹配领料完成");
  const after = selectReminders(s, Date.now());
  assert(!after.some((r) => r.orderId === o31.id && r.kind === "material"), "备料解决后待备料提醒消失（同一状态驱动）");
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
if (fail > 0) process.exit(1);
