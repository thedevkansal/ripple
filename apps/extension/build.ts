/**
 * Builds the unpacked extension into dist/. Point it at a Ripple server with RIPPLE_URL
 * (defaults to production): `RIPPLE_URL=http://localhost:3000 bun run build.ts`.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import sharp from "sharp";

const RIPPLE_URL = (process.env.RIPPLE_URL ?? "https://ripplemail.vercel.app").replace(/\/+$/, "");
const out = new URL("./dist/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));

await rm(out, { recursive: true, force: true });
await mkdir(`${out}icons`, { recursive: true });

const define = { __RIPPLE_URL__: JSON.stringify(RIPPLE_URL) };

// Content scripts and the popup run as classic scripts; the service worker as a module.
for (const [entry, format] of [
  ["src/gmail.ts", "iife"],
  ["src/connect.ts", "iife"],
  ["src/popup.ts", "iife"],
  ["src/background.ts", "esm"],
] as const) {
  const result = await Bun.build({
    entrypoints: [new URL(entry, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")],
    outdir: out,
    target: "browser",
    format,
    minify: true,
    define,
  });
  if (!result.success) {
    console.error(result.logs);
    process.exit(1);
  }
}

await cp(new URL("./static/", import.meta.url), out, { recursive: true });

// Icons rasterised from the Ripple mark (Chrome needs PNGs).
const svg = await readFile(new URL("../web/src/app/icon.svg", import.meta.url));
for (const size of [16, 32, 48, 128]) {
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(`${out}icons/icon-${size}.png`);
}

const host = new URL(RIPPLE_URL);
const manifest = {
  manifest_version: 3,
  name: "Ripple: email tracking for Gmail",
  short_name: "Ripple",
  version: pkg.version,
  description: "Know when your Gmail emails are opened and clicked. Read ticks in your Sent folder.",
  icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
  action: { default_popup: "popup.html", default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png" } },
  background: { service_worker: "background.js", type: "module" },
  permissions: ["storage"],
  host_permissions: [`${host.origin}/*`],
  content_scripts: [
    { matches: ["https://mail.google.com/*"], js: ["gmail.js"], run_at: "document_idle" },
    { matches: [`${host.origin}/dashboard/extension*`], js: ["connect.js"], run_at: "document_start" },
  ],
};
await writeFile(`${out}manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`Built Ripple extension v${pkg.version} for ${RIPPLE_URL} → ${out}`);
