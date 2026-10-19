import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInAvailability, msUntilClose, updatesOpenUntil } from "./pantryGate";

// October 2026 is CDT (UTC-5): Wed 14 Oct 10:00 local is 15:00Z.
const at = (iso: string) => new Date(iso);
const MIN = 60_000;

test("open Tue and Wed 9-3, Thu 11-5, closed otherwise", () => {
  assert.equal(msUntilClose(at("2026-10-13T14:00:00Z")), 6 * 60 * MIN); // Tue 09:00
  assert.equal(msUntilClose(at("2026-10-14T19:59:59Z")), 1000); // Wed 14:59:59
  assert.equal(msUntilClose(at("2026-10-14T20:00:00Z")), null); // Wed 15:00 closed
  assert.equal(msUntilClose(at("2026-10-14T13:59:59Z")), null); // Wed 08:59:59
  assert.equal(msUntilClose(at("2026-10-15T15:59:59Z")), null); // Thu 10:59:59
  assert.equal(msUntilClose(at("2026-10-15T16:00:00Z")), 6 * 60 * MIN); // Thu 11:00
  assert.equal(msUntilClose(at("2026-10-12T16:00:00Z")), null); // Mon
  assert.equal(msUntilClose(at("2026-10-16T16:00:00Z")), null); // Fri
  assert.equal(msUntilClose(at("2026-10-17T16:00:00Z")), null); // Sat
});

test("uses the pantry's clock across the daylight saving change", () => {
  // Tue 3 Nov 2026 is CST (UTC-6): 09:00 local is 15:00Z.
  assert.equal(msUntilClose(at("2026-11-03T15:00:00Z")), 6 * 60 * MIN);
  assert.equal(msUntilClose(at("2026-11-03T14:59:00Z")), null);
});

test("check-in is refused when closed or within 15 minutes of closing", () => {
  assert.equal(checkInAvailability(at("2026-10-14T16:00:00Z")), "ok"); // Wed 11:00
  assert.equal(checkInAvailability(at("2026-10-14T19:45:00Z")), "ok"); // 14:45, exactly 15 left
  assert.equal(checkInAvailability(at("2026-10-14T19:45:01Z")), "too_close_to_closing");
  assert.equal(checkInAvailability(at("2026-10-14T20:30:00Z")), "closed");
  assert.equal(checkInAvailability(at("2026-10-16T16:00:00Z")), "closed"); // Fri
});

test("a check-in lasts 30 minutes but never past closing", () => {
  const checkedIn = at("2026-10-14T16:00:00Z"); // Wed 11:00
  assert.equal(updatesOpenUntil(checkedIn, at("2026-10-14T16:10:00Z"))?.toISOString(), "2026-10-14T16:30:00.000Z");
  assert.equal(updatesOpenUntil(checkedIn, at("2026-10-14T16:30:00Z")), null);

  const late = at("2026-10-14T19:45:00Z"); // 14:45, the latest allowed check-in
  assert.equal(updatesOpenUntil(late, at("2026-10-14T19:50:00Z"))?.toISOString(), "2026-10-14T20:00:00.000Z");
  assert.equal(updatesOpenUntil(late, at("2026-10-14T20:00:00Z")), null);
});

import { pantryStatus } from "./pantryGate";
test("pantryStatus", () => {
  assert.deepEqual(pantryStatus(new Date("2026-10-14T15:00:00Z")), { open: true, detail: "9 AM to 3 PM" }); // Wed 10:00
  assert.equal(pantryStatus(new Date("2026-10-14T21:00:00Z")).detail, "Open tomorrow 11 AM to 5 PM"); // Wed 16:00
  assert.equal(pantryStatus(new Date("2026-10-14T12:00:00Z")).detail, "Open today 9 AM to 3 PM"); // Wed 07:00
  assert.equal(pantryStatus(new Date("2026-10-15T23:00:00Z")).detail, "Open Tuesday, Oct 20 9 AM to 3 PM"); // Thu 18:00
  assert.equal(pantryStatus(new Date("2026-11-26T17:00:00Z")).open, false); // Thanksgiving
  assert.equal(pantryStatus(new Date("2026-11-26T17:00:00Z")).detail, "Open Tuesday, Dec 1 9 AM to 3 PM");
});
