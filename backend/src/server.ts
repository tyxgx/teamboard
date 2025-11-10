// server.ts
import http from "http";
import app from "./index";
import { setupSocket } from "./sockets/socket"; // 👈 imported from our new file
import { prisma } from "./db/client";

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
prisma.$connect()
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

// Keep process alive and handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    prisma.$disconnect().then(() => {
      console.log('Database disconnected');
      process.exit(0);
    });
  });
});