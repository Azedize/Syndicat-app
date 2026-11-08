import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";
const [cmd] = process.argv.slice(2);
const email = "qa.ui.session@example.invalid";
if (cmd === "create") {
  const hash = await bcrypt.hash("MizanTest#2026", 10);
  await pool`INSERT INTO users (name, email, password_hash, role, status, syndicate_id) VALUES ('QA Session', ${email}, ${hash}, 'member', 'active', '04411594-655a-4bba-8b6f-60120c10ccd8') ON CONFLICT (email) DO NOTHING`;
} else if (cmd === "suspend") {
  await pool`UPDATE users SET status = 'suspended' WHERE email = ${email}`;
} else if (cmd === "delete") {
  const [u] = await pool`SELECT id FROM users WHERE email = ${email}`;
  if (u) {
    for (const t of ["refresh_tokens", "user_sessions", "audit_logs"]) await pool.unsafe(`DELETE FROM ${t} WHERE user_id = $1`, [u.id]).catch(() => {});
    await pool`DELETE FROM users WHERE id = ${u.id}`;
  }
}
console.log(cmd, "done");
await pool.end();
