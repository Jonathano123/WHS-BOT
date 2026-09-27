DISCORD BOT – KOMPLETTE SPIELVERSION

Enthalten:
- Imposter
- Quiz
- Tabu
- Stadt, Land, Fluss

WICHTIG:
Die vorhandenen Daten-Dateien aus deinem bisherigen Projekt müssen im Projekt bleiben:
- fragen.json
- scores.json
- tabuWords.json
- tabuScores.json
- stadtLandFlussScores.json (wird bei Bedarf erstellt)
- imposter/words.json

Ordnerstruktur:
index.js
package.json
Dockerfile
imposter/imposterGame.js
imposter/words.json

Railway:
- Dockerfile exakt mit großem D im Projekt-Root lassen.
- TOKEN als Railway-Variable setzen.
- npm install wird im Docker-Build ausgeführt.
- yt-dlp, Python 3 und ffmpeg werden im Container installiert.

- Leader wird nicht automatisch Spieler.
- Beitreten nur im selben Voice-Channel wie der Leader.
- Mindestens ein anderer Spieler zum Start.
- 0,1 / 1 / 2 / 4 / 7 / 10 Sekunden = 10 / 7 / 5 / 3 / 2 / 1 Punkte.
- Nach Spielstart keine neuen Spieler.

Imposter:
- 30-Sekunden-Autowechsel bleibt erhalten.
- Der aktuelle Spieler kann zusätzlich mit „Weiter“ sofort weitergeben.
- Nach allen Spielern entscheidet der Leader zwischen „Noch eine Runde“ und „Jetzt abstimmen“.
- „Noch eine Runde“ behält Wort und Imposter.
- „Neue Runde“ nach dem Ergebnis wählt neues Wort und neuen Imposter.
- Der Imposter hat während des Spiels immer „Wort erraten“.
