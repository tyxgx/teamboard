// Production entrypoint: apply pending Prisma migrations, then start the server.
//
// Why this is a script and not `prisma migrate deploy && node dist/server.js`:
// Supabase's transaction pooler (port 6543) cannot hold the advisory lock `migrate` takes, so migrate
// hangs forever, the server never binds a port, and Render times the deploy out ~15 minutes later with
// no explanation. Here migrations use DIRECT_URL (a direct or session-mode connection, port 5432) when
// set, and a hang is turned into a fast, explicit failure.
const { spawn } = require('child_process');

const MIGRATE_TIMEOUT_MS = Number(process.env.MIGRATE_TIMEOUT_MS) || 90_000;
const env = { ...process.env };
if (process.env.DIRECT_URL) env.DATABASE_URL = process.env.DIRECT_URL;

const usingPooler = /:6543\b/.test(env.DATABASE_URL || '');
if (usingPooler) {
  console.warn(
    '⚠️ Migrations are targeting port 6543 (Supabase transaction pooler), which usually hangs. ' +
      'Set DIRECT_URL to the direct/session connection string (port 5432).'
  );
}

const child = spawn('npx', ['prisma', 'migrate', 'deploy'], { env, stdio: 'inherit' });
const timer = setTimeout(() => {
  console.error(`❌ prisma migrate deploy did not finish within ${MIGRATE_TIMEOUT_MS / 1000}s; aborting deploy.`);
  if (usingPooler) console.error('   Cause is almost certainly the pooler port 6543: set DIRECT_URL (port 5432).');
  child.kill('SIGKILL');
  process.exit(1);
}, MIGRATE_TIMEOUT_MS);

child.on('exit', (code) => {
  clearTimeout(timer);
  if (code !== 0) {
    console.error(`❌ prisma migrate deploy failed (exit ${code}); not starting the server.`);
    process.exit(code || 1);
  }
  require('../dist/server.js');
});
