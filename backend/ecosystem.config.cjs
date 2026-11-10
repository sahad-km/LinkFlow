/**
 * LinkFlow Production Process Manager Configuration (PM2)
 * Run in production via: pm2 start ecosystem.config.cjs --env production
 */
module.exports = {
  apps: [
    {
      name: "linkflow-gateway",
      script: "./index.js",
      cwd: "./gateway",
      instances: 2,
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "linkflow-redirect",
      script: "./index.js",
      cwd: "./services/redirect",
      instances: "max", // Scale across all available CPU cores for maximum RPS
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "linkflow-url",
      script: "./index.js",
      cwd: "./services/url",
      instances: 2,
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "linkflow-auth",
      script: "./index.js",
      cwd: "./services/auth",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "linkflow-analytics",
      script: "./index.js",
      cwd: "./services/analytics",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
