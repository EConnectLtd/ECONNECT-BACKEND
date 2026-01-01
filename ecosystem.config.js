module.exports = {
  apps: [
    {
      name: "econnect-backend",
      script: "./server.js",
      instances: "4", // ✅ Use all CPU cores
      exec_mode: "cluster", // ✅ Enable cluster mode
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 4000,
      },
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      merge_logs: true,
      // Auto-restart on crash
      min_uptime: "10s",
      max_restarts: 10,
      // ✅ Graceful shutdown
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000,
    },
  ],
};
