#!/bin/bash

set -e

cd /app

echo "======================================"
echo " Discord Bot + Lavalink"
echo "======================================"

if [ ! -f "/app/Lavalink.jar" ]; then
    echo "Lavalink.jar wird heruntergeladen..."

    curl -L \
        "https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/Lavalink.jar" \
        -o "/app/Lavalink.jar"
fi

echo "Starte Lavalink..."

java -jar /app/Lavalink.jar > /app/lavalink.log 2>&1 &
LAVALINK_PID=$!

cleanup() {
    echo "Beende Lavalink..."
    kill "$LAVALINK_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "Warte auf Lavalink..."

for i in {1..60}; do
    if curl -s http://127.0.0.1:2333/version >/dev/null 2>&1; then
        echo "Lavalink ist bereit."
        break
    fi

    if ! kill -0 "$LAVALINK_PID" 2>/dev/null; then
        echo "Lavalink ist unerwartet beendet worden."
        cat /app/lavalink.log
        exit 1
    fi

    sleep 1
done

if ! curl -s http://127.0.0.1:2333/version >/dev/null 2>&1; then
    echo "Lavalink wurde nicht rechtzeitig bereit."
    cat /app/lavalink.log
    exit 1
fi

echo "Starte Python Discord Bot..."

exec python3 /app/bot.py
