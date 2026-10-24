// Черта для Windows: окно Electron вокруг веб-части. Сборка — .github/workflows/windows.yml.
const { app, BrowserWindow, shell, session, dialog, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { startServer } = require("./server.cjs");

// Адрес (а значит и хранилище IndexedDB/localStorage) должен быть всегда один и тот же: фиксированный порт.
const PORT = 47831;
const ORIGIN = `http://localhost:${PORT}/`;
const wwwDir = app.isPackaged ? path.join(process.resourcesPath, "www") : path.join(__dirname, "www");

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

// Масштаб: меню убрано, поэтому клавиши Ctrl+ / Ctrl− / Ctrl+0 и Ctrl+колесо обрабатываем сами; значение помним между запусками.
const ZOOMS = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5];
const zoomFile = () => path.join(app.getPath("userData"), "zoom.json");
function loadZoom() {
  try { const z = JSON.parse(fs.readFileSync(zoomFile(), "utf8")).factor; if (z >= 0.5 && z <= 3) return z; } catch { /* первый запуск */ }
  return 1; // масштаб по умолчанию обычный; Ctrl + плюс/минус меняет
}
function setZoom(factor) {
  if (!win) return;
  const f = Math.min(3, Math.max(0.5, factor));
  win.webContents.setZoomFactor(f);
  try { fs.writeFileSync(zoomFile(), JSON.stringify({ factor: f })); } catch { /* не страшно */ }
}
const stepZoom = (dir) => {
  const cur = win.webContents.getZoomFactor();
  const next = dir > 0 ? ZOOMS.find((z) => z > cur + 0.01) : [...ZOOMS].reverse().find((z) => z < cur - 0.01);
  if (next) setZoom(next);
};
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

async function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1200, height: 820, minWidth: 420, minHeight: 600,
    title: "Черта", backgroundColor: "#1b1b1b", autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  // Микрофон нужен для «Произношения» и голосового ввода; остальное не просим.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(["media", "audioCapture", "clipboard-read", "clipboard-sanitized-write", "fullscreen"].includes(permission)));
  // Внешние ссылки (статьи bkrs.info и т. п.) — в браузере, не в окне приложения.
  const external = (url) => { if (!url.startsWith(ORIGIN)) { shell.openExternal(url); return true; } return false; };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (external(url)) e.preventDefault(); });
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown" || !(input.control || input.meta) || input.alt) return;
    if (input.key === "=" || input.key === "+") { e.preventDefault(); stepZoom(1); }
    else if (input.key === "-" || input.key === "_") { e.preventDefault(); stepZoom(-1); }
    else if (input.key === "0") { e.preventDefault(); setZoom(1); }
  });
  // F11 — полный экран, Esc — выход из него.
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    else if (input.key === "Escape" && win.isFullScreen()) { e.preventDefault(); win.setFullScreen(false); }
  });
  win.webContents.on("zoom-changed", (_e, dir) => stepZoom(dir === "in" ? 1 : -1));
  win.webContents.on("did-finish-load", () => win.webContents.setZoomFactor(loadZoom()));
  await win.loadURL(ORIGIN);
}

app.whenReady().then(async () => {
  try {
    await startServer(wwwDir, PORT, "127.0.0.1", (u, o) => fetch(u, o));
  } catch (e) {
    dialog.showErrorBox("Черта", `Не удалось запустить: порт ${PORT} занят другой программой. Закройте её и откройте Черту снова.\n\n${e && e.message}`);
    app.quit();
    return;
  }
  await createWindow();
});
app.on("window-all-closed", () => app.quit());
