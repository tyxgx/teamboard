import pkg from 'pg';
const { Client } = pkg;

// Render me env se DATABASE_URL lo
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL not found in environment variables!");
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false } // Supabase ke liye SSL
});

async function testConnection() {
  try {
    await client.connect();
    console.log("✅ Connected to Supabase!");
    const res = await client.query("SELECT NOW()");
    console.log("📅 Server time is:", res.rows[0]);
  } catch (err) {
    console.error("❌ Connection failed:", err.message);
  } finally {
    await client.end();
  }
}

testConnection();