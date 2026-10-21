/**
 * Напоминания. Сайт-приложение не может само проснуться в нужную минуту, поэтому два пути:
 *  1) календарь: файл .ics с ежедневным событием и сигналом — работает на любом телефоне;
 *  2) уведомления (Chrome на Android, приложение установлено на экран): периодическая фоновая проверка
 *     service worker'а — если сегодня ещё не занимались и время напоминания прошло, показывается уведомление.
 *     Браузер сам решает, как часто её запускать (примерно раз в 12 часов), так что время не точное.
 */
import * as store from "../store.ts";
import { $, downloadText } from "./dom.ts";

export type Remind = { time: string; on: boolean };
const DEFAULT: Remind = { time: "20:00", on: false };
const load = async () => ({ ...DEFAULT, ...((await store.getMeta<Remind>("remind")) ?? {}) });

/** Файл календаря: каждый день в выбранное время, сигнал в момент события. */
export function icsFor(time: string, now = new Date()): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cherta//RU", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:cherta-daily-${Date.now()}@cherta`, `DTSTAMP:${stamp}`, `DTSTART:${local}`, "DURATION:PT15M", "RRULE:FREQ=DAILY",
    "SUMMARY:Черта: китайский — повторения на сегодня", "DESCRIPTION:Открой «Черту» и нажми «Сегодня»: https://akamekiller.github.io/cherta/",
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Пора повторить слова", "TRIGGER:PT0M", "END:VALARM", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}

async function render() {
  const r = await load();
  $<HTMLInputElement>("rm-time").value = r.time;
  const canPush = "serviceWorker" in navigator && "Notification" in window;
  $("rm-push").hidden = !canPush;
  $("rm-push").textContent = r.on && Notification.permission === "granted" ? "Уведомления: включены ✓" : "Включить уведомления";
}

export function initRemind() {
  render();
  $("rm-time").addEventListener("change", async (e) => {
    const r = await load();
    await store.setMeta("remind", { ...r, time: (e.target as HTMLInputElement).value || DEFAULT.time });
  });
  $("rm-ics").addEventListener("click", async () => {
    const r = await load();
    void downloadText("cherta-reminder.ics", icsFor($<HTMLInputElement>("rm-time").value || r.time), "text/calendar;charset=utf-8");
    $("rm-msg").textContent = "Файл сохранён — откройте его, и календарь добавит ежедневное напоминание.";
  });
  $("rm-push").addEventListener("click", async () => {
    const msg = $("rm-msg");
    const r = await load();
    if (r.on) { await store.setMeta("remind", { ...r, on: false }); msg.textContent = "Уведомления выключены."; render(); return; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { msg.textContent = "Уведомления не разрешены — можно включить в настройках браузера."; return; }
    await store.setMeta("remind", { ...r, on: true });
    let periodic = false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const ps = (reg as unknown as { periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void> } }).periodicSync;
      if (ps) { await ps.register("cherta-remind", { minInterval: 12 * 3_600_000 }); periodic = true; }
    } catch { /* браузер не дал */ }
    msg.textContent = periodic
      ? "Готово. Телефон сам решает, когда проверять, поэтому время примерное. Для точного времени добавьте ещё и напоминание в календарь."
      : "Уведомления разрешены, но этот браузер не умеет проверять в фоне. Надёжнее — напоминание в календаре.";
    render();
  });
}
