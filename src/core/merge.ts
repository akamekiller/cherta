/**
 * Слияние двух резервных копий прогресса (для синхронизации между устройствами).
 * Ничего не теряется: карточка — та, что повторена позже; журнал — объединение; правки — более свежие;
 * свои колоды — объединение слов; настройки — с этого устройства, но списки колод и курсов объединяются;
 * прогресс упражнений и курсов — лучший результат.
 */
import { mergeLib } from "./reading.ts";
import { mergeProg } from "./hskprog.ts";
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const byId = <T extends Any>(list: T[] | undefined, key = "id") => new Map((list ?? []).map((x) => [x[key], x] as const));

export function mergeBackups(local: Any, remote: Any): Any {
  if (!remote) return local;
  const cards = byId(local.cards);
  for (const c of remote.cards ?? []) {
    const l = cards.get(c.id);
    if (!l || (c.last ?? 0) > (l.last ?? 0) || ((c.last ?? 0) === (l.last ?? 0) && (c.reps ?? 0) > (l.reps ?? 0))) cards.set(c.id, c);
  }
  const revKey = (r: Any) => `${r.id}|${r.at}`;
  const reviews = new Map<string, Any>((local.reviews ?? []).map((r: Any) => [revKey(r), r] as [string, Any]));
  for (const r of remote.reviews ?? []) if (!reviews.has(revKey(r))) reviews.set(revKey(r), r);
  const edits = byId(local.edits);
  for (const e of remote.edits ?? []) { const l = edits.get(e.id); if (!l || (e.updatedAt ?? 0) > (l.updatedAt ?? 0)) edits.set(e.id, e); }
  const decks = byId(local.userDecks);
  for (const d of remote.userDecks ?? []) {
    const l = decks.get(d.id);
    if (!l) { decks.set(d.id, d); continue; }
    const have = new Set(l.words.map((w: string[]) => w[0]));
    decks.set(d.id, { ...l, words: [...l.words, ...d.words.filter((w: string[]) => !have.has(w[0]))] });
  }
  const ls = local.settings ?? {}, rs = remote.settings ?? {};
  // что когда добавлено/удалено: по каждому ключу — последнее действие
  const listAt: Record<string, number> = { ...(rs.listAt ?? {}) };
  for (const [k, v] of Object.entries((ls.listAt ?? {}) as Record<string, number>)) if (Math.abs(v) > Math.abs(listAt[k] ?? 0)) listAt[k] = v;
  const alive = (key: string) => (listAt[key] ?? 1) > 0;
  const union = (a: string[] | undefined, b: string[] | undefined, prefix: string) =>
    (a || b ? [...new Set([...(a ?? []), ...(b ?? [])])].filter((id) => alive(prefix + id)) : undefined);
  const settings = { ...rs, ...ls, deckOpts: { ...(rs.deckOpts ?? {}), ...(ls.deckOpts ?? {}) }, listAt };
  const added = union(ls.added, rs.added, "deck:"); if (added) settings.added = added;
  const courses = union(ls.courses, rs.courses, "course:"); if (courses) settings.courses = courses;
  const ex: Any = { ...(remote.ex ?? {}) };
  for (const [k, v] of Object.entries((local.ex ?? {}) as Any)) {
    const r = ex[k];
    ex[k] = r ? { seen: Math.max(v.seen, r.seen), ok: Math.max(v.ok, r.ok), last: Math.max(v.last, r.last) } : v;
  }
  const exsets = [...byId([...(remote.exsets ?? []), ...(local.exsets ?? [])]).values()].filter((x: Any) => alive(`ex:${x.id}`));
  const course: Any = JSON.parse(JSON.stringify(remote.course ?? {}));
  for (const [ck, lessons] of Object.entries((local.course ?? {}) as Any)) {
    course[ck] ??= {};
    for (const [li, steps] of Object.entries(lessons as Any)) {
      course[ck][li] ??= {};
      for (const [st, v] of Object.entries(steps as Any)) course[ck][li][st] = Math.max(Number(v), Number(course[ck][li][st] ?? 0));
    }
  }
  return {
    ...local,
    cards: [...cards.values()],
    reviews: [...reviews.values()].sort((a: Any, b: Any) => a.at - b.at),
    edits: [...edits.values()],
    userDecks: [...decks.values()].filter((d: Any) => alive(`ud:${d.id}`)),
    settings, ex, exsets, course,
    reading: local.reading || remote.reading ? mergeLib(local.reading, remote.reading) : undefined,
    hsk: local.hsk || remote.hsk ? mergeProg(local.hsk, remote.hsk) : undefined,
    day: local.day ?? remote.day,
  };
}
