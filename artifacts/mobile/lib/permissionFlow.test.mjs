// Run with: node --test lib/permissionFlow.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { nextPermissionStep, publicEntry, shouldOfferPush } from "./permissionFlow.ts";

test("a granted permission is used without any dialog", () => {
  assert.equal(nextPermissionStep({ granted: true, canAskAgain: true }), "granted");
  assert.equal(nextPermissionStep({ granted: true, canAskAgain: false }), "granted");
});

test("a permission that can be requested is explained first", () => {
  assert.equal(nextPermissionStep({ granted: false, canAskAgain: true }), "explain");
});

test("a permanently denied or restricted permission leads to the system settings", () => {
  assert.equal(nextPermissionStep({ granted: false, canAskAgain: false }), "settings");
});

test("notifications are offered once", () => {
  assert.equal(shouldOfferPush({ granted: false, canAskAgain: true }, false), true);
  assert.equal(shouldOfferPush({ granted: false, canAskAgain: true }, true), false);
});

test("notifications are not offered when already granted or blocked", () => {
  assert.equal(shouldOfferPush({ granted: true, canAskAgain: true }, false), false);
  assert.equal(shouldOfferPush({ granted: false, canAskAgain: false }, false), false);
});

test("first launch: language, then welcome, then directly the sign-in", () => {
  assert.equal(publicEntry("new"), "/first-launch");
  assert.equal(publicEntry("language"), "/welcome");
  assert.equal(publicEntry("done"), "/login");
});
