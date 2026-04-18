module.exports = {
  apps: [
    {
      name: 'sanctions-engine',
      script: 'src/server.js',
      cwd: '/home/ubuntu/sanctions/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 3000,
      max_restarts: 20,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: '/home/ubuntu/sanctions/logs/error.log',
      out_file: '/home/ubuntu/sanctions/logs/out.log',
      log_file: '/home/ubuntu/sanctions/logs/combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
