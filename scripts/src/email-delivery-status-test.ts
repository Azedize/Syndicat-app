/**
 * What an e-mail log row says, and what it may claim (2026-10-25). Runs on the
 * isolated test base with a local SMTP sink on 127.0.0.1 that relays nothing:
 *
 *   pnpm --filter @workspace/scripts run email-delivery-status:test
 *
 *   simulation (OUTBOUND_DELIVERY=off)   → skipped, reason given, never « sent »
 *   reserved / undeliverable address     → skipped, never attempted
 *   queued                               → a « pending » row exists before the attempt ends
 *   accepted by the provider             → sent + the provider's reply (queue id)
 *   refused by the provider              → failed after the retries, reason kept
 *   secret-bearing message               → body not stored
 * The real SMTP settings of .env are replaced before the service is loaded;
 * the test stops if the configured host is not the loopback sink.
 */
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { pool } from "@workspace/db";

const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const q = <T = any>(text: string, params: unknown[] = []) => (pool as any).unsafe(text, params) as Promise<T[]>;

/** Minimal SMTP server: accepts everything except recipients containing « refuse ». */
function startSink(): Promise<{ port: number; received: string[]; close: () => void }> {
  const received: string[] = [];
  let seq = 0;
  const server = net.createServer((sock) => {
    let data = false;
    let authStep = 0; // AUTH LOGIN: 1 = username expected, 2 = password expected
    let buf = "";
    sock.write("220 sink.local ESMTP test\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i: number;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (data) {
          if (line === ".") {
            data = false;
            seq++;
            received.push(`msg${seq}`);
            sock.write(`250 2.0.0 OK queued as SINK${seq}\r\n`);
          }
          continue;
        }
        if (authStep) {
          sock.write(authStep === 1 ? "334 UGFzc3dvcmQ6\r\n" : "235 2.7.0 ok\r\n");
          authStep = authStep === 1 ? 2 : 0;
          continue;
        }
        const cmd = line.toUpperCase();
        if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) sock.write("250-sink.local\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n");
        else if (cmd.startsWith("AUTH PLAIN")) sock.write("235 2.7.0 ok\r\n");
        else if (cmd.startsWith("AUTH LOGIN")) { authStep = 1; sock.write("334 VXNlcm5hbWU6\r\n"); }
        else if (cmd.startsWith("MAIL FROM")) sock.write("250 OK\r\n");
        else if (cmd.startsWith("RCPT TO")) sock.write(/REFUSE/.test(cmd) ? "550 5.1.1 no such user\r\n" : "250 OK\r\n");
        else if (cmd === "DATA") { data = true; sock.write("354 go ahead\r\n"); }
        else if (cmd === "RSET" || cmd === "NOOP") sock.write("250 OK\r\n");
        else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
        else sock.write("250 OK\r\n");
      }
    });
    sock.on("error", () => {});
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as net.AddressInfo).port, received, close: () => server.close() })));
}

const created: string[] = [];

async function main() {
  const [{ d }] = await q<{ d: string }>("SELECT current_database() AS d");
  if (d !== "syndycat_test") throw new Error(`Base de test attendue (syndycat_test), pas ${d}`);
  const sink = await startSink();
  // Replace .env's real SMTP settings BEFORE the service creates its transport.
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(sink.port), SMTP_USER: "sink", SMTP_PASS: "sink", USE_TLS: "false", SMTP_SECURE: "false", SMTP_FROM: "noreply@sink.local" });
  if (process.env.SMTP_HOST !== "127.0.0.1") throw new Error("SMTP host is not the local sink: stopping.");
  const mod = await import(pathToFileURL(path.resolve("../artifacts/api-server/src/lib/email/emailService.ts")).href);
  const send = mod.sendTransactionalEmail as (o: any) => Promise<{ ok: boolean; skipped?: boolean; error?: string; logId?: string }>;
  const row = async (id?: string) => (await q(`SELECT status, error_message, provider_message_id, sent_at, body_html, retry_count FROM email_logs WHERE id = $1`, [id]))[0];
  // A recipient in a real-looking domain: only the local sink ever sees it.
  const to = (local: string) => `${local}@boite-locale-de-test.ma`;

  // 1. Simulation
  process.env.OUTBOUND_DELIVERY = "off";
  const sim = await send({ to: to("simulation"), subject: "Simulation", html: "<p>x</p>", template: "test_email" });
  if (sim.logId) created.push(sim.logId);
  const simRow = await row(sim.logId);
  check("simulation: logged as skipped with its reason, nothing sent", sim.skipped === true && simRow?.status === "skipped" && /OUTBOUND_DELIVERY/.test(simRow?.error_message ?? "") && sink.received.length === 0);
  delete process.env.OUTBOUND_DELIVERY;

  // 2. Reserved address
  const res = await send({ to: "personne@quelque-part.test", subject: "Réservé", html: "<p>x</p>", template: "test_email" });
  if (res.logId) created.push(res.logId);
  check("reserved address: skipped, never attempted", res.skipped === true && (await row(res.logId))?.status === "skipped" && sink.received.length === 0);

  // 3. Queued, then accepted by the provider
  const pending = send({ to: to("accepte"), subject: "Accepté", html: "<p>x</p>", template: "test_email" });
  await new Promise((r) => setTimeout(r, 15));
  const [{ n: queued }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM email_logs WHERE recipient = $1 AND status = 'pending'`, [to("accepte")]);
  const ok = await pending;
  if (ok.logId) created.push(ok.logId);
  const okRow = await row(ok.logId);
  check("queued: a « pending » row exists while the attempt runs", queued >= 1, `${queued}`);
  check("accepted by the provider: sent, with its reply as proof", ok.ok && okRow?.status === "sent" && /^250 .*SINK\d+/.test(okRow?.provider_message_id ?? "") && !!okRow?.sent_at && sink.received.length === 1, okRow?.provider_message_id ?? "none");

  // 4. Refused by the provider
  const ko = await send({ to: to("refuse"), subject: "Refusé", html: "<p>x</p>", template: "test_email" });
  if (ko.logId) created.push(ko.logId);
  const koRow = await row(ko.logId);
  check("refused by the provider: failed after the retries, reason kept, no proof", !ko.ok && koRow?.status === "failed" && /550/.test(koRow?.error_message ?? "") && koRow?.provider_message_id === null && koRow?.sent_at === null, `${koRow?.status} retries=${koRow?.retry_count}`);

  // 5. Secret-bearing message: delivered to the sink, body not kept
  const secret = await send({ to: to("secret"), subject: "Réinitialisation", html: "<p>lien jeton=ABCDEF0123456789</p>", template: "password_reset" });
  if (secret.logId) created.push(secret.logId);
  const sRow = await row(secret.logId);
  check("secret-bearing message: sent, body not stored", sRow?.status === "sent" && sRow?.body_html === null);
  check("nothing else reached the sink", sink.received.length === 2, `${sink.received.length} message(s)`);
  sink.close();
}

main()
  .catch((e) => { console.error(e); checks.push({ name: "run", ok: false }); })
  .finally(async () => {
    if (created.length) await q(`DELETE FROM email_logs WHERE id = ANY($1)`, [created]);
    const failed = checks.filter((c) => !c.ok).length;
    console.log(`\n${checks.length - failed}/${checks.length} e-mail delivery status checks passed`);
    await pool.end();
    process.exit(failed ? 1 : 0);
  });
