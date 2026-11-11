/* global process, console, setTimeout, clearTimeout, URL */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";

// Fail before publishing a URL if another game instance owns either port.
for (const port of [5173, 3001]) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(
        new Error(
          `Port ${port} is in use. Stop npm run dev before running dev:https.`,
        ),
      ),
    );
    probe.listen(port, "0.0.0.0", () => probe.close(resolve));
  });
}
if (process.env.PORT && process.env.PORT !== "3001") {
  throw new Error(
    "dev:https requires PORT=3001 to match the Vite relay proxy. Clear PORT first.",
  );
}

const children = [];
let stopping = false;
let dev;
let log = "";
let timeout;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timeout);
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === "win32") {
      // npm/concurrently spawn descendants; stop only our own process trees.
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else child.kill("SIGTERM");
  }
  process.exitCode = code;
}
function watch(child, label) {
  children.push(child);
  child.once("error", (error) => {
    console.error(`${label}: ${error.message}`);
    if (label === "cloudflared")
      console.error(
        "Install once: winget install --id Cloudflare.cloudflared --exact (then reopen PowerShell).",
      );
    stop(1);
  });
  child.once("exit", (code) => stop(code ?? 1));
}
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());

const tunnel = spawn(
  "cloudflared",
  ["tunnel", "--url", "http://localhost:5173"],
  {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
watch(tunnel, "cloudflared");
timeout = setTimeout(() => {
  console.error(
    "No Quick Tunnel URL after 90 seconds. Check the cloudflared output and Internet connection.",
  );
  stop(1);
}, 90_000);
function output(chunk) {
  process.stdout.write(chunk);
  log = (log + chunk.toString()).slice(-16_384);
  const origin = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
  if (!origin || dev || stopping) return;
  clearTimeout(timeout);
  dev = spawn(process.execPath, [process.env.npm_execpath, "run", "dev"], {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, DINK_PUBLIC_HOST: new URL(origin).hostname },
  });
  watch(dev, "game dev servers");
  console.log(
    `\nOpen ${origin} on the laptop after Vite is ready, then scan that page's QR on your iPhone.\nKeep this terminal open. Ctrl+C stops the game and tunnel.\n`,
  );
}
tunnel.stdout.on("data", output);
tunnel.stderr.on("data", output);
