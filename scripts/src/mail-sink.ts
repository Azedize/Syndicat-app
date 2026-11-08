/**
 * Local test mail sink (2026-11-08). A minimal SMTP server on 127.0.0.1 that
 * accepts every message and writes it to a file. It never relays anything: no
 * message can reach a real mailbox. Used with an API started by
 * `scripts/start-mail-sink-api.ps1` (EMAIL_SINK=on, SMTP_HOST=127.0.0.1).
 *
 *   node --import=tsx src/mail-sink.ts serve        # listens on 127.0.0.1:1025
 *   node --import=tsx src/mail-sink.ts list         # subject, recipient, time
 *   node --import=tsx src/mail-sink.ts show <to>    # last message to <to>, decoded text
 *
 * Messages: scripts/.seedgen/mail-sink/*.eml (ignored by Git with .seedgen).
 */
import { createServer, type Socket } from "node:net";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(import.meta.dirname, "..", ".seedgen", "mail-sink");
const PORT = Number(process.env.MAIL_SINK_PORT ?? 1025);
mkdirSync(DIR, { recursive: true });

function serve() {
  const server = createServer((socket: Socket) => {
    let buffer = "";
    let inData = false;
    let data: string[] = [];
    let from = "";
    let to: string[] = [];
    let authStep: "none" | "user" | "pass" = "none";
    const say = (line: string) => socket.write(`${line}\r\n`);
    say("220 mizan-mail-sink ESMTP (test only, never relays)");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let i: number;
      while ((i = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            const name = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.eml`;
            writeFileSync(join(DIR, name), `X-Sink-From: ${from}\r\nX-Sink-To: ${to.join(", ")}\r\n${data.join("\r\n")}\r\n`);
            data = [];
            say("250 OK stored");
          } else data.push(line.startsWith("..") ? line.slice(1) : line);
          continue;
        }
        if (authStep === "user") { authStep = "pass"; say("334 UGFzc3dvcmQ6"); continue; }
        if (authStep === "pass") { authStep = "none"; say("235 Authenticated"); continue; }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO") { say("250-mizan-mail-sink"); say("250-AUTH PLAIN LOGIN"); say("250 8BITMIME"); }
        else if (cmd === "HELO") say("250 mizan-mail-sink");
        else if (cmd === "AUTH") {
          if (/^AUTH LOGIN/i.test(line)) { authStep = "user"; say("334 VXNlcm5hbWU6"); } else say("235 Authenticated");
        } else if (cmd === "MAIL") { from = line.replace(/^MAIL FROM:\s*/i, ""); to = []; say("250 OK"); }
        else if (cmd === "RCPT") { to.push(line.replace(/^RCPT TO:\s*/i, "")); say("250 OK"); }
        else if (cmd === "DATA") { inData = true; say("354 End data with <CR><LF>.<CR><LF>"); }
        else if (cmd === "QUIT") { say("221 Bye"); socket.end(); }
        else if (cmd === "RSET" || cmd === "NOOP") say("250 OK");
        else say("502 Command not implemented");
      }
    });
    socket.on("error", () => {});
  });
  server.listen(PORT, "127.0.0.1", () => console.log(`mail sink listening on 127.0.0.1:${PORT}, messages in ${DIR}`));
}

/** Decoded text of a stored message (quoted-printable / base64 bodies, HTML stripped). */
export function readMessage(raw: string) {
  const header = (name: string) => (raw.match(new RegExp(`^${name}:\\s*(.*)$`, "mi")) ?? [])[1]?.trim() ?? "";
  const decodeWord = (s: string) =>
    s.replace(/=\?utf-8\?([BQ])\?([^?]*)\?=/gi, (_m, enc: string, txt: string) =>
      enc.toUpperCase() === "B" ? Buffer.from(txt, "base64").toString("utf8") : Buffer.from(txt.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_x, h) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8"));
  const parts = raw.split(/\r?\n--[^\r\n]+\r?\n/);
  let text = "";
  for (const p of parts.length > 1 ? parts : [raw]) {
    const [head, ...rest] = p.split(/\r?\n\r?\n/);
    let body = rest.join("\n\n");
    if (/content-transfer-encoding:\s*base64/i.test(head)) body = Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    else if (/content-transfer-encoding:\s*quoted-printable/i.test(head))
      body = Buffer.from(body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_x, h) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8");
    if (/content-type:\s*text\/(plain|html)/i.test(head)) text += `${body.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ")}\n`;
  }
  return { to: header("X-Sink-To"), subject: decodeWord(header("Subject")), date: header("Date"), text: text.replace(/\n\s*\n+/g, "\n").trim() };
}

function messages() {
  return readdirSync(DIR).filter((f) => f.endsWith(".eml")).sort().map((f) => ({ file: f, ...readMessage(readFileSync(join(DIR, f), "utf8")) }));
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "serve") serve();
else if (cmd === "list") for (const m of messages()) console.log(`${m.file}  ${m.to}  ${m.subject}`);
else if (cmd === "show") {
  const m = messages().filter((x) => !arg || x.to.toLowerCase().includes(arg.toLowerCase())).pop();
  console.log(m ? `To: ${m.to}\nSubject: ${m.subject}\n\n${m.text}` : "no message");
}
