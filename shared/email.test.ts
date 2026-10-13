import { test } from "node:test";
import assert from "node:assert/strict";
import { isUtaEmail } from "./email";

test("accepts uta.edu and mavs.uta.edu, ignoring case and padding", () => {
  assert.equal(isUtaEmail("abc1234@mavs.uta.edu"), true);
  assert.equal(isUtaEmail("prof@uta.edu"), true);
  assert.equal(isUtaEmail("  Abc@MAVS.UTA.EDU "), true);
});

test("rejects other domains, lookalikes and malformed addresses", () => {
  for (const bad of [
    "me@gmail.com",
    "me@uta.edu.evil.com",
    "me@evil-uta.edu",
    "me@sub.uta.edu",
    "me@uta.edu@evil.com",
    "@uta.edu",
    "uta.edu",
    "a b@uta.edu",
    "",
  ]) {
    assert.equal(isUtaEmail(bad), false, bad);
  }
});
