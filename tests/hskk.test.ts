import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOral, assembleOral, scoreTask, scoreOral, wantLen, type OItem } from "../src/core/hskk.ts";

const SRC = `# комментарий
== 1 repeat
我叫王明。 | = Меня зовут Ван Мин.
== 1 answer
你叫什么名字？ | 我叫王明。 | 叫 | = Как тебя зовут?
你几岁？ | 我二十岁。 | - | = Сколько лет?
== 1 prompt
请介绍一下你自己。 | 我叫王明，今年二十五岁，是俄罗斯人。 | 叫 岁 | = Расскажите о себе.
== 2 picture
🌧️ ☂️ | 下雨 雨伞 | 今天下雨，大家都打着雨伞。 | = Дождь.
== 3 retell
他很着急，马上回到超市去找钱包。 | = Он ищет кошелёк.
`;

test("разбор банка HSKK", () => {
  const b = parseOral(SRC);
  assert.equal(b.length, 6);
  assert.deepEqual(b.map((x) => x.kind), ["repeat", "answer", "answer", "prompt", "picture", "retell"]);
  assert.equal(b[0].id, "1Rep-1");
  assert.deepEqual(b[1].keys, ["叫"]);
  assert.deepEqual(b[2].keys, []);
  assert.deepEqual(b[4].keys, ["下雨", "雨伞"]);
  assert.equal(b[4].sample, "今天下雨，大家都打着雨伞。");
  assert.equal(b[1].ru, "Как тебя зовут?");
  assert.equal(new Set(b.map((x) => x.id)).size, 6);
});

test("сборка: нужное число, давно не звучавшие первыми", () => {
  const bank: OItem[] = Array.from({ length: 20 }, (_, i) => ({ id: `1Rep-${i}`, level: 1, kind: "repeat", zh: "我好" }));
  const seen: Record<string, number> = {};
  for (let i = 0; i < 10; i++) seen[`1Rep-${i}`] = 100;
  const v = assembleOral(1, bank, seen, () => 0.5);
  assert.equal(v.length, 1);
  assert.equal(v[0].items.length, 15);
  assert.ok(v[0].items.slice(0, 10).every((x) => Number(x.id.split("-")[1]) >= 10));
  assert.equal(assembleOral(2, bank, {}, Math.random).length, 0);
});

test("оценка повтора по тексту", () => {
  const it = parseOral(SRC)[0];
  assert.equal(scoreTask(it, "我叫王明").pts, 100);
  assert.ok(scoreTask(it, "我叫").pts < 100 && scoreTask(it, "我叫").pts > 40);
  assert.equal(scoreTask(it, "").pts, 0);
  assert.equal(scoreTask(it, "hello").pts, 0);
});

test("оценка ответа своими словами: опоры и длина", () => {
  const it = parseOral(SRC)[3];
  assert.ok(wantLen(it) > 0);
  const full = scoreTask(it, "我叫李华，今年三十岁，我是俄罗斯人，我在学校工作。");
  assert.equal(full.pts, 100);
  const part = scoreTask(it, "我叫李华。");
  assert.ok(part.pts < 70);
  assert.deepEqual(part.missing, ["岁"]);
  assert.ok(part.short > 0);
});

test("оценка пересказа — по доле сохранённого", () => {
  const it = parseOral(SRC)[5];
  assert.equal(scoreTask(it, it.zh).pts, 100);
  const half = scoreTask(it, "他很着急").pts;
  assert.ok(half > 30 && half < 100);
});

test("итог: среднее частей, сдал от 60", () => {
  const s = scoreOral([{ kind: "repeat", pts: 80 }, { kind: "repeat", pts: 60 }, { kind: "answer", pts: 50 }]);
  assert.equal(s.parts.find((p) => p.kind === "repeat")!.pts, 70);
  assert.equal(s.total, 60);
  assert.equal(s.passed, true);
  assert.equal(scoreOral([{ kind: "read", pts: 30 }]).passed, false);
  assert.equal(scoreOral([]).total, 0);
});
