import { test } from "node:test";
import assert from "node:assert/strict";
import { icsFor } from "../src/ui/remind.ts";

test("icsFor: ежедневное событие с сигналом в выбранное время", () => {
  const t = icsFor("07:45", new Date(2026, 9, 19, 12, 0));
  assert.match(t, /DTSTART:20261019T074500/);
  assert.match(t, /RRULE:FREQ=DAILY/);
  assert.match(t, /BEGIN:VALARM/);
  assert.ok(t.includes("\r\n"));
});
