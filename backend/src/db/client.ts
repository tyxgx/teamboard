import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

/**
 * Prisma Client Configuration
 * 
 * IMPORTANT: Connection Pooling
 * - Use DATABASE_URL (pooled connection) for runtime queries
 * - For Supabase: Use pooled connection string (typically includes ?pgbouncer=true)
 * - DIRECT_URL should only be used for migrations (via schema.prisma datasource)
 * 
 * Connection pool size is controlled by the connection string parameters:
 * - For serverless (Render): Recommended pool size 10-20
 * - Connection string format: postgresql://...?connection_limit=10&pool_timeout=10
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // Connection pooling is handled via DATABASE_URL connection string parameters
    // Ensure DATABASE_URL includes pooling parameters for optimal performance
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
