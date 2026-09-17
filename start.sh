#!/bin/sh
set -eu

echo "========================================"
echo " Starte Lavalink"
echo "========================================"

mkdir -p /app/lavalink/plugins /app/lavalink/logs

cd /app/lavalink
java -Xms128M -Xmx512M -jar /app/Lavalink.jar > /app/lavalink/logs/lavalink.log 2>&1 &
LAVALINK_PID=$!

echo "Lavalink PID: ${LAVALINK_PID}"

echo "Warte auf Lavalink..."
i=0
while [ "$i" -lt 60 ]; do
    if curl -fsS http://127.0.0.1:2333/version >/dev/null 2>&1; then
        echo "Lavalink ist bereit."
        break
    fi

    if ! kill -0 "$LAVALINK_PID" 2>/dev/null; then
        echo "Lavalink ist unerwartet beendet worden."
        cat /app/lavalink/logs/lavalink.log || true
        exit 1
    fi

    i=$((i + 1))
    sleep 1
done

if ! curl -fsS http://127.0.0.1:2333/version >/dev/null 2>&1; then
    echo "Lavalink wurde nicht rechtzeitig bereit."
    cat /app/lavalink/logs/lavalink.log || true
    exit 1
fi

cd /app
exec python bot.py
