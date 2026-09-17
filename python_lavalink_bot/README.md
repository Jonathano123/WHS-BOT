# Discord Bot – Python + Lavalink

Die bisherige Node.js-Struktur wird auf Python umgestellt.

## Dateien

- `bot.py` – Discord-Bot und Slash Commands
- `music/lavalink.py` – Wavelink/Lavalink-Verbindung
- `games/menu.py` – Spiele-Menü
- `games/imposter.py` – Imposter
- `games/quiz.py` – Quiz
- `games/tabu.py` – Tabu
- `games/stadt_land_fluss.py` – Stadt-Land-Fluss
- `games/song_guesser.py` – Song Guesser + Lavalink
- `data/top1000Songs.json` – Platz für die bisherige 1000er-Liste
- `application.yml` – Lavalink-Konfiguration
- `.env.example` – Umgebungsvariablen
- `Dockerfile` – Python/Railway

## Installation

1. `.env.example` in `.env` kopieren.
2. `DISCORD_TOKEN` eintragen.
3. Lavalink als eigenen Service starten.
4. `LAVALINK_URI` und `LAVALINK_PASSWORD` setzen.
5. `pip install -r requirements.txt`
6. `python bot.py`

## Wichtig zu Lavalink v4

YouTube ist in aktuellen Lavalink-v4-Installationen nicht mehr einfach als eingebauter Standard-Source verfügbar. Für YouTube-Wiedergabe muss der passende Lavalink-Source-Plugin/Provider im Lavalink-Service installiert und konfiguriert werden.

## Status der Portierung

Die Python-Struktur und Lavalink-Anbindung stehen. Die exakten Spielregeln der bisherigen JavaScript-Spiele sollten jetzt einzeln aus der vorhandenen Version übernommen werden, damit keine Regeln verloren gehen. Die vorhandene 1000er-Songliste muss ebenfalls aus der bisherigen Version in `data/top1000Songs.json` übernommen werden.
