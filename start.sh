#!/bin/bash
# Sanctions Engine startup script
# Called by cron @reboot to ensure the app starts after system restart

export PATH="/home/ubuntu/.nvm/versions/node/v22.13.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PM2_HOME="/home/ubuntu/.pm2"
export NODE_ENV="production"

PM2="/home/ubuntu/sanctions/backend/node_modules/pm2/bin/pm2"
LOG="/home/ubuntu/sanctions/logs/startup.log"

echo "$(date): Starting Sanctions Engine..." >> "$LOG"

# Wait for network
sleep 15

# Try to resurrect saved processes
$PM2 resurrect >> "$LOG" 2>&1

# If resurrect failed, start directly from ecosystem config
if ! $PM2 list 2>/dev/null | grep -q "online"; then
    echo "$(date): Resurrect failed, starting from ecosystem config..." >> "$LOG"
    cd /home/ubuntu/sanctions/backend
    $PM2 start ecosystem.config.js >> "$LOG" 2>&1
fi

echo "$(date): Startup complete. PM2 status:" >> "$LOG"
$PM2 list >> "$LOG" 2>&1
