module.exports = {
  apps: [{
    name: 'atb-lol-bot',
    script: 'src/index.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '400M',
    kill_timeout: 10000,
    listen_timeout: 10000,
    wait_ready: false,
    node_args: [
      '--max-old-space-size=512',
      '--expose-gc'
    ],
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    merge_logs: true,
    time: true,
    autorestart: true,
    restart_delay: 5000,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
