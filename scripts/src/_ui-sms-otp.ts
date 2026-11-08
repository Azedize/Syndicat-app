// Simulates reading the SMS (outbound SMS is off in tests): stores a known phone code, as journeys-test does.
import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
const [phone, code] = process.argv.slice(2);
await pool`INSERT INTO otp_tokens (email, purpose, code_hash, expires_at) VALUES (${phone}, 'phone_verification', ${createHash("sha256").update(code).digest("hex")}, now() + interval '5 minutes')`;
console.log("sms code stored for", phone);
await pool.end();
