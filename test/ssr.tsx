import { renderToString } from "react-dom/server";
import App from "../src/App";

const html = renderToString(<App />);
const required = ["适配单", "复查提醒", "马匹档案", "库存与履历", "O-1001", "HORSE-18", "停待备料", "新建适配单"];
let ok = true;
for (const k of required) {
  if (!html.includes(k)) {
    console.error("missing in HTML:", k);
    ok = false;
  }
}
console.log("render length:", html.length);
console.log(ok ? "SSR SMOKE OK" : "SSR SMOKE FAIL");
process.exit(ok ? 0 : 1);
