// Run with: node --test lib/parseAmount.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAmount } from "./parseAmount.ts";

test("a comma and a point mean the same thing", () => {
  assert.equal(parseAmount("1500,50"), 1500.5);
  assert.equal(parseAmount("1500.50"), 1500.5);
});

test("spaces between thousands are accepted", () => {
  assert.equal(parseAmount("1 500,50"), 1500.5);
  assert.equal(parseAmount(" 20 "), 20);
});

test("what cannot be read exactly is refused, never truncated", () => {
  for (const bad of ["", "abc", "12abc", "1,500.50", "1.2.3", "10,123", "-5", ",50"]) {
    assert.equal(parseAmount(bad), null, bad);
  }
});
