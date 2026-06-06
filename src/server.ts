import http from 'http';
import app from './app';
import { config } from '@config/environment';
import { db } from '@common/database/client';

const server = http.createServer(app);

/**
 * Start server
 */
const startServer = async () => {
  try {
    // Test database connection
    console.log('Testing database connection...');
    await db.$queryRaw`SELECT 1`;
    console.log('✓ Database connected');

    // Start listening
    server.listen(config.port, () => {
      console.log(`
╔════════════════════════════════════════════════╗
║   School ERP SaaS Backend Started              ║
╠════════════════════════════════════════════════╣
║ Environment: ${config.node_env.padEnd(30)} ║
║ Port: ${String(config.port).padEnd(39)} ║
║ Database: Connected                           ║
╚════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

/**
 * Graceful shutdown
 */
const gracefulShutdown = async () => {
  console.log('\nShutting down gracefully...');

  server.close(async () => {
    await db.$disconnect();
    console.log('Server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server
startServer();

export default server;
