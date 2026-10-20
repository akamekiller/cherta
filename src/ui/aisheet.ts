/**
 * «Попросить ИИ сделать файл»: копируем готовую инструкцию с точным форматом, человек вставляет её в Claude/ChatGPT
 * вместе со своим материалом (фото страницы учебника, список слов), а ответ вставляет обратно — в импорт.
 */
import { aiPrompt, type AiKind } from "../core/aiprompt.ts";
import { esc } from "./dom.ts";
import { openSheet } from "./sheet.ts";

const WHAT: Record<AiKind, { name: string; ph: string }> = {
  cards: { name: "слова для карточек", ph: "Например: слова 5-го урока, фото страницы приложу; или: 30 слов на тему «больница», уровень HSK 3" },
  text: { name: "текст для чтения", ph: "Например: текст про поход в магазин, уровень HSK 2, 8–10 предложений" },
  course: { name: "курс упражнений", ph: "Например: курс по урокам 1–5 учебника, фото страниц приложу; или: курс из 6 уроков «работа на заводе», уровень HSK 3" },
};

export function openAiPrompt(kind: AiKind, onPaste: () => void) {
  const w = WHAT[kind];
  openSheet("Попросить ИИ", `<div class="stack ai">
      <p class="hint">ИИ (Claude, ChatGPT и др.) соберёт ${w.name} в формате, который «Черта» точно примет.</p>
      <ol class="ai-steps">
        <li>Напишите, что нужно (можно пропустить).</li>
        <li>Нажмите «Скопировать инструкцию».</li>
        <li>Откройте чат с ИИ, вставьте инструкцию и приложите материал: фото страниц учебника, список слов или текст.</li>
        <li>Скопируйте ответ ИИ целиком и нажмите «Вставить ответ» — откроется импорт с проверкой.</li>
      </ol>
      <label class="field"><span class="label">Что нужно</span><textarea id="ai-wish" rows="3" placeholder="${esc(w.ph)}"></textarea></label>
      <button class="btn primary wide" id="ai-copy">Скопировать инструкцию</button>
      <p class="hint center" id="ai-msg" aria-live="polite"></p>
      <button class="btn wide" id="ai-paste">Вставить ответ ИИ</button>
      <details class="paste"><summary>Показать инструкцию</summary><textarea id="ai-text" rows="12" readonly></textarea></details>
    </div>`, (root) => {
    const wish = root.querySelector<HTMLTextAreaElement>("#ai-wish")!;
    const txt = root.querySelector<HTMLTextAreaElement>("#ai-text")!;
    const msg = root.querySelector<HTMLElement>("#ai-msg")!;
    const fill = () => { txt.value = aiPrompt(kind, wish.value); };
    fill();
    wish.addEventListener("input", fill);
    root.querySelector("#ai-copy")!.addEventListener("click", async () => {
      fill();
      try { await navigator.clipboard.writeText(txt.value); msg.textContent = "Скопировано. Вставьте в чат с ИИ."; }
      catch {
        // буфер недоступен — показываем текст выделенным, чтобы скопировать вручную
        (root.querySelector("details") as HTMLDetailsElement).open = true;
        txt.focus(); txt.select();
        msg.textContent = "Не получилось скопировать само — текст выделен ниже, скопируйте его.";
      }
    });
    root.querySelector("#ai-paste")!.addEventListener("click", onPaste);
    wish.blur();
  });
}
