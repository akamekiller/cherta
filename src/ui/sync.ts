/**
 * Синхронизация между устройствами через приватный GitHub Gist пользователя (свой токен с правом «gist»).
 * Токен хранится только в этом браузере (localStorage), в резервную копию и в Gist не попадает.
 * Синхронизация = скачать копию из Gist → слить с локальной (core/merge.ts) → записать локально → загрузить обратно.
 * Сама — при запуске (не чаще раза в 10 минут) и после занятия карточек.
 */
import { reloadAll } from "../state.ts";
import * as store from "../store.ts";
import { mergeBackups } from "../core/merge.ts";
import { $, esc } from "./dom.ts";

const LS = "cherta.sync";
const FILE = "cherta-progress.json";
const DESC = "Черта — прогресс (синхронизация, не удалять)";
type Cfg = { token: string; gistId: string; last: number };
function cfg(): Cfg {
  try { return { token: "", gistId: "", last: 0, ...JSON.parse(localStorage.getItem(LS) ?? "{}") }; } catch { return { token: "", gistId: "", last: 0 }; }
}
function saveCfg(c: Cfg) { try { localStorage.setItem(LS, JSON.stringify(c)); } catch { /* */ } }

async function api(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (r.status === 401) throw new Error("Токен не подошёл: проверьте, что он скопирован целиком и у него есть право «gist».");
  if (!r.ok) throw new Error(`GitHub ответил ошибкой ${r.status}.`);
  return r.json();
}

/** Найти свой Gist «Черты» (на втором устройстве id ещё неизвестен). */
async function findGist(token: string): Promise<string> {
  for (let page = 1; page <= 5; page++) {
    const list: { id: string; description: string; files: Record<string, unknown> }[] = await api(`/gists?per_page=100&page=${page}`, token);
    const g = list.find((x) => x.files?.[FILE] && x.description === DESC);
    if (g) return g.id;
    if (list.length < 100) break;
  }
  return "";
}

let busy = false;
export type SyncResult = { ok: boolean; msg: string };

export async function syncNow(): Promise<SyncResult> {
  const c = cfg();
  if (!c.token) return { ok: false, msg: "Сначала вставьте токен." };
  if (busy) return { ok: false, msg: "Уже синхронизируется…" };
  busy = true;
  try {
    if (!c.gistId) c.gistId = await findGist(c.token);
    let remote: Record<string, unknown> | null = null;
    if (c.gistId) {
      const g = await api(`/gists/${c.gistId}`, c.token);
      const f = g.files?.[FILE];
      if (f) {
        const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
        try { remote = JSON.parse(text); } catch { remote = null; }
      }
    }
    const local = JSON.parse(await store.exportAll());
    const merged = mergeBackups(local, remote ?? {});
    if (remote) { await store.importAll(JSON.stringify(merged)); await reloadAll(); }
    const body = JSON.stringify({ description: DESC, files: { [FILE]: { content: JSON.stringify(merged) } } });
    if (c.gistId) await api(`/gists/${c.gistId}`, c.token, { method: "PATCH", body });
    else c.gistId = (await api("/gists", c.token, { method: "POST", body: JSON.stringify({ ...JSON.parse(body), public: false }) })).id;
    c.last = Date.now();
    saveCfg(c);
    return { ok: true, msg: `Синхронизировано: ${new Date(c.last).toLocaleString("ru-RU")}. Карточек: ${(merged.cards as unknown[]).length}.` };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? (e.message === "Failed to fetch" ? "Нет интернета или GitHub недоступен." : e.message) : "Не получилось." };
  } finally { busy = false; }
}

/** Тихая синхронизация: при запуске (не чаще раза в 10 минут) и после занятия. */
export async function autoSync(force = false): Promise<boolean> {
  const c = cfg();
  if (!c.token || !navigator.onLine) return false;
  if (!force && Date.now() - c.last < 10 * 60_000) return false;
  return (await syncNow()).ok;
}

function render() {
  const c = cfg();
  $("sync-box").innerHTML = c.token
    ? `<p class="hint">Синхронизация включена${c.last ? `. Последняя: ${esc(new Date(c.last).toLocaleString("ru-RU"))}` : ""}. Прогресс хранится в вашем приватном Gist на GitHub.</p>
      <div class="row"><button class="btn small primary" id="sync-now">Синхронизировать сейчас</button><button class="btn small" id="sync-off">Отключить</button></div>`
    : `<p class="hint">Один и тот же прогресс на телефоне и компьютере. Для этого нужен аккаунт GitHub и свой «токен» — одноразовый ключ, которым приложение записывает ваш прогресс в приватный Gist (скрытую заметку, видимую только вам).</p>
      <ol class="sync-steps">
        <li><a class="btn small primary" href="https://github.com/settings/tokens/new?scopes=gist&description=%D0%A7%D0%B5%D1%80%D1%82%D0%B0" target="_blank" rel="noopener">Создать токен на GitHub</a>
          <span>Откроется GitHub; если попросит, войдите в аккаунт (или зарегистрируйтесь — это бесплатно).</span></li>
        <li><span>В поле «Expiration» выберите <b>No expiration</b>. Галочка «gist» уже стоит — больше ничего не отмечайте. Внизу нажмите зелёную <b>Generate token</b>.</span></li>
        <li><span>Скопируйте токен (он начинается с <b>ghp_</b>) и вставьте ниже. GitHub показывает его <b>только один раз</b> — сохраните его в заметках, он пригодится для второго устройства.</span></li>
        <li><span>На втором устройстве вставьте <b>тот же токен</b> — прогресс подтянется сам.</span></li>
      </ol>
      <div class="row sync-in"><input type="password" id="sync-token" placeholder="ghp_…" autocomplete="off" spellcheck="false"><button class="btn small primary" id="sync-save">Подключить</button></div>
      <p class="hint">Токен хранится только на этом устройстве. Если GitHub не открывается (например, в Китае без VPN), синхронизация не заработает — тогда переносите прогресс файлом: «Сохранить в файл» в разделе «Прогресс и правки».</p>`;
}

export function initSync() {
  const box = $("sync-box");
  render();
  box.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const msg = $("sync-msg");
    if (t.closest("#sync-save")) {
      const token = $<HTMLInputElement>("sync-token").value.trim();
      if (!token) return;
      saveCfg({ token, gistId: "", last: 0 });
      render();
      msg.textContent = "Синхронизирую…";
      const r = await syncNow();
      msg.textContent = r.msg;
      msg.classList.toggle("danger", !r.ok);
      render();
      if (r.ok) document.dispatchEvent(new CustomEvent("cherta:synced"));
    } else if (t.closest("#sync-now")) {
      msg.textContent = "Синхронизирую…";
      const r = await syncNow();
      msg.textContent = r.msg;
      msg.classList.toggle("danger", !r.ok);
      render();
      if (r.ok) document.dispatchEvent(new CustomEvent("cherta:synced"));
    } else if (t.closest("#sync-off")) {
      saveCfg({ token: "", gistId: "", last: 0 });
      msg.textContent = "Синхронизация отключена. Копия в Gist осталась — её можно удалить на GitHub.";
      render();
    }
  });
  document.addEventListener("cherta:done", () => { autoSync(true); });
}
