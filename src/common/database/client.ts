import { PrismaClient } from '@prisma/client';
import { config } from '@config/environment';

let prisma: PrismaClient;

function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: config.isDevelopment
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });
  }

  return prisma;
}

export const db = getPrismaClient();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await db.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await db.$disconnect();
  process.exit(0);
});

export default db;
