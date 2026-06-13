// PM2 process configuration for the School ERP backend.
// Runs the compiled server (dist/server.js) and loads env vars from .env
// (via the app's own dotenv call) using this directory as the cwd.
module.exports = {
  apps: [
    {
      name: 'erp-backend',
      script: 'dist/server.js',
      cwd: '/root/erp_backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: '/root/erp_backend/logs/pm2-out.log',
      error_file: '/root/erp_backend/logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
