import postgres from "postgres";
process.loadEnvFile("../../.env");
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  const r = await sql.unsafe(process.argv.slice(2).join(" "));
  console.log(JSON.stringify(r, null, 1));
} catch (e) { console.log("ERR", e.message); }
await sql.end();
