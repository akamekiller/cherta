// Черта для Windows: окно Electron вокруг веб-части. Сборка — .github/workflows/windows.yml.
const { app, BrowserWindow, shell, session, dialog, Menu } = require("electron");
const path = require("node:path");
const { startServer } = require("./server.cjs");

// Адрес (а значит и хранилище IndexedDB/localStorage) должен быть всегда один и тот же: фиксированный порт.
const PORT = 47831;
const ORIGIN = `http://localhost:${PORT}/`;
const wwwDir = app.isPackaged ? path.join(process.resourcesPath, "www") : path.join(__dirname, "www");

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
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
