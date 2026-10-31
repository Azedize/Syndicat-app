// pnpm --filter mobile run test:login-transport
// Where the app sends API requests, depending on where it runs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isTunnelHost, resolveApiBaseUrl } from "./login-transport.ts";

const dev = (platform, hostUri, extra = {}) => resolveApiBaseUrl({ port: "5000", isDev: true, platform, hostUri, ...extra });

test("phone on the same Wi-Fi (LAN mode): the dev machine's address", () => {
  assert.equal(dev("ios", "192.168.1.20:8081"), "http://192.168.1.20:5000/api");
  assert.equal(dev("android", "192.168.1.20:8081"), "http://192.168.1.20:5000/api");
});

test("Android emulator: the emulator alias", () => {
  assert.equal(dev("android", "localhost:8081"), "http://10.0.2.2:5000/api");
});

test("a localhost API URL is rewritten to the LAN address on a phone", () => {
  assert.equal(dev("ios", "192.168.1.20:8081", { apiUrl: "http://localhost:5000/api" }), "http://192.168.1.20:5000/api");
});

test("tunnel mode: the Expo tunnel host is never used for the API (it only serves Metro)", () => {
  for (const h of ["abc-anonymous-8081.exp.direct", "xyz.on.expo.app", "foo.ngrok-free.app"]) {
    assert.ok(isTunnelHost(h), h);
    assert.ok(!dev("ios", `${h}:443`).includes(h), `API must not target ${h}`);
  }
});

test("tunnel mode with a public API URL: that URL is used as is", () => {
  assert.equal(dev("ios", "abc.exp.direct", { apiUrl: "https://api-test.trycloudflare.com/api" }), "https://api-test.trycloudflare.com/api");
});

test("production: the configured URL, untouched", () => {
  assert.equal(resolveApiBaseUrl({ apiUrl: "https://api.example.ma/api", port: "5000", isDev: false, platform: "ios", hostUri: null }), "https://api.example.ma/api");
});

test("a LAN address is not mistaken for a tunnel", () => {
  assert.ok(!isTunnelHost("192.168.1.20"));
  assert.ok(!isTunnelHost("localhost"));
});
