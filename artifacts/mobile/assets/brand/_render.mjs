// Renders the brand SVGs to the PNG assets referenced by app.json.
// Needs @resvg/resvg-js, which is not a project dependency:
//   npm i --no-save @resvg/resvg-js@2.6.2 && node assets/brand/_build.mjs && node assets/brand/_render.mjs
import fs from "fs";
import { Resvg } from "@resvg/resvg-js";

const here = (p) => new URL(p, import.meta.url);
const OUT = [
  ["icon.svg", "../images/icon.png", 1024],
  ["adaptive-foreground.svg", "../images/adaptive-icon.png", 1024],
  ["splash.svg", "../images/splash-mark.png", 600],
  ["notification.svg", "../images/notification-icon.png", 96],
  ["mark-tile.svg", "../images/favicon.png", 196],
];
for (const [src, dst, width] of OUT) {
  const png = new Resvg(fs.readFileSync(here(src), "utf8"), { fitTo: { mode: "width", value: width } }).render().asPng();
  fs.writeFileSync(here(dst), png);
  console.log(dst, width);
}
fs.copyFileSync(here("mark-tile.svg"), here("../images/mizan-mark.svg"));
