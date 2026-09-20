// server.ts
import http from 'http';
import app from './index';
import { setupSocket } from './sockets/socket'; // 👈 imported from our new file
import { prisma } from './db/client';
import { checkConfig } from './config';

const config = checkConfig();
config.warnings.forEach((w) => console.warn(`⚠️ ${w}`));
if (config.errors.length > 0) {
  config.errors.forEach((e) => console.error(`❌ ${e}`));
  process.exit(1);
}

const PORT = process.env.PORT || 5001;
const server = http.createServer(app);

// 🔌 Attach socket server
setupSocket(server);

// Add error handlers to catch crashes
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    console.error('Server error details:', error);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let the server continue running
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Exit gracefully
  process.exit(1);
});

// Test database connection on startup
prisma
  .$connect()
  .then(() => {
    console.log('✅ Database connected');
  })
  .catch((error) => {
    console.error('❌ Database connection failed:', error);
    console.error('Database error details:', error.message);
    // Don't exit - let server start and fail on first request
  });

// 🚀 Start HTTP + WebSocket server
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

// Uploaded-but-never-sent images are removed after an hour so abandoned uploads don't pile up in Postgres.
const ORPHAN_MAX_AGE_MS = 60 * 60 * 1000;
const orphanSweep = setInterval(
  async () => {
    try {
      const { count } = await prisma.attachment.deleteMany({
        where: { commentId: null, createdAt: { lt: new Date(Date.now() - ORPHAN_MAX_AGE_MS) } },
      });
      if (count > 0) console.log(`🧹 Removed ${count} unsent image upload(s)`);
    } catch (error) {
      console.error('Orphan attachment sweep failed', error);
    }
  },
  15 * 60 * 1000
);
orphanSweep.unref();

// Graceful shutdown on both SIGTERM (Render deploys/stops) and SIGINT (Ctrl+C). If open sockets keep
// server.close() from finishing, force the exit after 10s so a deploy is never stuck on the old instance.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully`);
  const force = setTimeout(() => {
    console.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  force.unref();
  server.close(() => {
    console.log('Server closed');
    prisma
      .$disconnect()
      .catch(() => undefined)
      .then(() => {
        console.log('Database disconnected');
        process.exit(0);
      });
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
