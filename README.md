# Discord Bot – komplett Python + Lavalink

Das ist die neue komplette Projektstruktur.

## Was enthalten ist

- Python / discord.py
- Lavalink 4.2.2
- YouTube-Source-Plugin 1.18.2
- Imposter
- Quiz
- Tabu
- Stadt, Land, Fluss
- Song Guesser
- Song-Guesser-Suche über 1000 Songs
- Ephemere private Antworten bei Song-Guesser
- JSON-Ranglisten
- Docker/Railway

## Deployment

Der Container startet automatisch zuerst Lavalink und danach den Python-Bot.

Die einzige vorhandene Umgebungsvariable, die der Bot benötigt, ist:

`TOKEN`

Der bisherige Railway-Name `TOKEN` bleibt also bestehen.

## Discord

Die Slash Commands werden beim Start für die beiden bisher im Projekt verwendeten Server-IDs synchronisiert.

## Song Guesser

Beim ersten Start lädt der Bot die Top-1000-Liste und speichert sie unter:

`data/top1000Songs.json`

Danach wird der lokale Cache verwendet.

Für die Suche werden maximal 25 Treffer in einem Discord-Select-Menü angezeigt, weil Discord Select Menüs auf 25 Optionen begrenzt sind.

## Lavalink

Lavalink läuft im selben Container auf `127.0.0.1:2333`.

Der Bot verwendet Wavelink als Python-Lavalink-Client.
