from __future__ import annotations

import asyncio
import json
import random
import re
import unicodedata
from pathlib import Path

import aiohttp
import discord
import wavelink
from discord.ext import commands

from music.lavalink import get_player
from .storage import ROOT, get_guild_scores, save_guild_scores, ranking_text

URLS = [
    "https://digitaldreamdoor.com/pages/best_songs_1000_popular_1-500.html",
    "https://digitaldreamdoor.com/pages/best_songs_1000_popular_501-1000.html",
]
CACHE = ROOT / "data" / "top1000Songs.json"


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", str(text or ""))
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace("ß", "ss")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


async def load_top_1000():
    try:
        cached = json.loads(CACHE.read_text(encoding="utf-8"))
        if isinstance(cached, list) and len(cached) >= 1000:
            return cached[:1000]
    except Exception:
        pass

    songs = []
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout, headers={"User-Agent": "Mozilla/5.0"}) as session:
        for url in URLS:
            async with session.get(url) as response:
                response.raise_for_status()
                text = await response.text()

            text = re.sub(r"<script[\s\S]*?</script>", "\n", text, flags=re.I)
            text = re.sub(r"<style[\s\S]*?</style>", "\n", text, flags=re.I)
            text = re.sub(r"<[^>]+>", "\n", text)
            text = text.replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'")
            text = re.sub(r"\s+", " ", text)

            # Extract numbered entries robustly.
            pattern = re.compile(
                r"(?:^|\s)(\d{1,4})\.\s*(.*?)\s+-\s+(.*?)\s+-\s+(?:(?:18|19|20)\d{2}(?:\s*[-,]\s*(?:18|19|20)\d{2})?)",
                re.I,
            )
            for match in pattern.finditer(text):
                rank = int(match.group(1))
                if not 1 <= rank <= 1000:
                    continue
                title = re.sub(r"\s+", " ", match.group(2)).strip()
                artist = re.sub(r"\s+", " ", match.group(3)).strip()
                if title and artist:
                    songs.append({"rank": rank, "title": title, "artist": artist})

            # Fallback for differently formatted numbered lines.
            for line in re.split(r"[\r\n]+", text):
                line = re.sub(r"\s+", " ", line).strip()
                m = re.match(r"^(\d{1,4})\.\s*(.+)$", line)
                if not m:
                    continue
                rank = int(m.group(1))
                if not 1 <= rank <= 1000:
                    continue
                rest = re.sub(r"\s+-\s+(?:18|19|20)\d{2}(?:\s*[-,]\s*(?:18|19|20)\d{2})?\s*$", "", m.group(2)).strip()
                parts = re.split(r"\s+-\s+", rest)
                if len(parts) >= 2:
                    title = parts[0].strip()
                    artist = " - ".join(parts[1:]).strip()
                    if title and artist:
                        songs.append({"rank": rank, "title": title, "artist": artist})

    unique = {}
    for song in songs:
        unique[song["rank"]] = song
    songs = [unique[k] for k in sorted(unique) if 1 <= k <= 1000]

    if len(songs) < 1000:
        raise RuntimeError(f"Die Top-1000-Liste konnte nicht vollständig geladen werden ({len(songs)}/1000).")

    CACHE.write_text(json.dumps(songs[:1000], ensure_ascii=False, indent=2), encoding="utf-8")
    return songs[:1000]


class SongSearchModal(discord.ui.Modal, title="Song suchen"):
    query = discord.ui.TextInput(
        label="Titel oder Interpret",
        placeholder="z. B. Queen oder Bohemian Rhapsody",
        max_length=100,
    )

    def __init__(self, game):
        super().__init__()
        self.game = game

    async def on_submit(self, interaction):
        q = normalize(self.query.value)
        matches = []
        for song in self.game.songs:
            title = normalize(song["title"])
            artist = normalize(song["artist"])
            score = 0
            if title == q or artist == q:
                score = 100
            elif title.startswith(q) or artist.startswith(q):
                score = 80
            elif q in title or q in artist:
                score = 50
            if score:
                matches.append((score, song))

        matches.sort(key=lambda x: (-x[0], x[1]["rank"]))
        songs = [s for _, s in matches[:25]]

        if not songs:
            await interaction.response.send_message("❌ Keine passenden Songs gefunden.", ephemeral=True)
            return

        await interaction.response.send_message(
            "🎵 Wähle deine Antwort:",
            view=SongResultsView(self.game, songs, interaction.user.id),
            ephemeral=True,
        )


class SongResultsView(discord.ui.View):
    def __init__(self, game, songs, user_id):
        super().__init__(timeout=120)
        self.game = game
        self.songs = songs
        self.user_id = user_id
        options = [
            discord.SelectOption(
                label=s["title"][:100],
                description=s["artist"][:100],
                value=str(i),
            )
            for i, s in enumerate(songs)
        ]
        select = discord.ui.Select(
            placeholder="Song auswählen...",
            options=options,
        )

        async def callback(interaction):
            if interaction.user.id != self.user_id:
                await interaction.response.send_message("❌ Diese Auswahl gehört zu einer anderen Suche.", ephemeral=True)
                return
            await self.game.check_answer(interaction, self.songs[int(select.values[0])])

        select.callback = callback
        self.add_item(select)


class SongGuessView(discord.ui.View):
    def __init__(self, game):
        super().__init__(timeout=180)
        self.game = game

    @discord.ui.button(label="🎵 Song auswählen", style=discord.ButtonStyle.primary)
    async def pick(self, interaction, button):
        if interaction.user.id not in self.game.players:
            await interaction.response.send_message("❌ Du bist nicht in dieser Runde.", ephemeral=True)
            return
        await interaction.response.send_modal(SongSearchModal(self.game))


class SongLobbyView(discord.ui.View):
    def __init__(self, game):
        super().__init__(timeout=600)
        self.game = game

    @discord.ui.button(label="Beitreten", emoji="👥", style=discord.ButtonStyle.success)
    async def join(self, interaction, button):
        if interaction.user.id not in self.game.players:
            self.game.players.append(interaction.user.id)
        await interaction.response.edit_message(embed=self.game.lobby_embed(), view=self)

    @discord.ui.button(label="Starten", emoji="▶️", style=discord.ButtonStyle.primary)
    async def start(self, interaction, button):
        await self.game.start(interaction)

    @discord.ui.button(label="Verlassen", emoji="🚪", style=discord.ButtonStyle.secondary)
    async def leave(self, interaction, button):
        if interaction.user.id in self.game.players:
            self.game.players.remove(interaction.user.id)
        await interaction.response.edit_message(embed=self.game.lobby_embed(), view=self)


class SongGame:
    def __init__(self, cog, guild_id, channel, leader_id):
        self.cog = cog
        self.guild_id = guild_id
        self.channel = channel
        self.leader_id = leader_id
        self.players = [leader_id]
        self.running = True
        self.current = None
        self.guessed = set()
        self.songs = cog.songs

    def lobby_embed(self):
        players = "\n".join(f"{i+1}. <@{uid}>" for i, uid in enumerate(self.players))
        return discord.Embed(
            title="🎵 SONG GUESSER – Lobby",
            description=f"👑 Leader: <@{self.leader_id}>\n\n👥 Spieler:\n{players}\n\nMindestens **2 Spieler** werden benötigt.",
        )

    async def start(self, interaction):
        if interaction.user.id != self.leader_id:
            await interaction.response.send_message("❌ Nur der Leader kann starten.", ephemeral=True)
            return
        if len(self.players) < 2:
            await interaction.response.send_message("❌ Mindestens **2 Spieler** werden benötigt.", ephemeral=True)
            return
        if not self.songs:
            await interaction.response.send_message("⏳ Die Top-1000-Songs werden gerade geladen.", ephemeral=True)
            try:
                self.songs = await load_top_1000()
                self.cog.songs = self.songs
            except Exception as exc:
                await interaction.edit_original_response(content=f"❌ Songliste konnte nicht geladen werden: {exc}")
                return

        self.current = random.choice(self.songs)
        self.guessed = set()

        try:
            voice = interaction.user.voice.channel
        except AttributeError:
            voice = None

        if voice is None:
            await interaction.response.send_message("❌ Du musst in einem Voice-Channel sein.", ephemeral=True)
            return

        await interaction.response.edit_message(
            content="🎵 **Song Guesser gestartet!**",
            embed=None,
            view=None,
        )

        player = await get_player(interaction.guild, voice)
        results = await wavelink.Playable.search(f'ytsearch:{self.current["artist"]} {self.current["title"]} official audio')
        if not results:
            await self.channel.send("❌ Der aktuelle Song konnte über Lavalink nicht gefunden werden.")
            return
        await player.play(results[0])

        await self.channel.send(
            embed=discord.Embed(
                title="🎵 Song Guesser",
                description="Der Song läuft jetzt!\n\nJeder Spieler kann **Song auswählen** drücken. Die Suche ist auf die 1000 Songs begrenzt.",
            ),
            view=SongGuessView(self),
        )

    async def check_answer(self, interaction, selected):
        if interaction.user.id in self.guessed:
            await interaction.response.send_message("⚠️ Du hast diese Runde bereits richtig gelöst.", ephemeral=True)
            return

        correct = (
            normalize(selected["title"]) == normalize(self.current["title"])
            and normalize(selected["artist"]) == normalize(self.current["artist"])
        )

        if not correct:
            await interaction.response.send_message("❌ Falsch!", ephemeral=True)
            return

        self.guessed.add(interaction.user.id)
        all_scores, scores = get_guild_scores("songguesserScores.json", self.guild_id)
        uid = str(interaction.user.id)
        scores.setdefault(uid, {"name": interaction.user.display_name, "points": 0, "correct": 0, "rounds": 0})
        scores[uid]["name"] = interaction.user.display_name
        scores[uid]["points"] += 1
        scores[uid]["correct"] += 1
        save_guild_scores("songguesserScores.json", all_scores)

        await interaction.response.send_message(
            f"✅ **Richtig!** **{self.current['title']}** – **{self.current['artist']}**\n+1 Punkt",
            ephemeral=True,
        )

        if len(self.guessed) >= len(self.players):
            await self.next_round()

    async def next_round(self):
        player = self.channel.guild.voice_client
        if isinstance(player, wavelink.Player):
            await player.stop()
        await asyncio.sleep(1)
        self.current = random.choice(self.songs)
        self.guessed.clear()
        voice = player.channel if isinstance(player, wavelink.Player) and player.channel else None
        if voice:
            results = await wavelink.Playable.search(f'ytsearch:{self.current["artist"]} {self.current["title"]} official audio')
            if results:
                await player.play(results[0])
        await self.channel.send("🔄 **Neue Runde!** Der nächste Song läuft.", view=SongGuessView(self))

    async def stop(self):
        self.running = False
        player = self.channel.guild.voice_client
        if isinstance(player, wavelink.Player):
            await player.stop()


class SongGuesserCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.games = {}
        self.songs = []

    async def start(self, interaction):
        guild_id = interaction.guild.id
        if guild_id in self.games and self.games[guild_id].running:
            await interaction.response.send_message("❌ Song Guesser läuft bereits.", ephemeral=True)
            return
        game = SongGame(self, guild_id, interaction.channel, interaction.user.id)
        self.games[guild_id] = game
        await interaction.response.send_message("🎵 **SONG GUESSER GESTARTET!**", ephemeral=True)
        await interaction.channel.send(embed=game.lobby_embed(), view=SongLobbyView(game))

    async def stop(self, interaction):
        game = self.games.get(interaction.guild.id)
        if game:
            await game.stop()
        await interaction.response.send_message("🛑 **Song Guesser beendet.**")

    async def rank(self, interaction):
        _, scores = get_guild_scores("songguesserScores.json", interaction.guild.id)
        await interaction.response.send_message("🏆 **SONG-GUESSER-RANGLISTE**\n\n" + ranking_text(scores))

    async def reset(self, interaction):
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("❌ Dafür brauchst du Administrator-Rechte.", ephemeral=True)
            return
        all_scores, _ = get_guild_scores("songguesserScores.json", interaction.guild.id)
        all_scores[str(interaction.guild.id)] = {}
        save_guild_scores("songguesserScores.json", all_scores)
        await interaction.response.send_message("🔄 **Song-Guesser-Rangliste zurückgesetzt!**")


async def setup(bot):
    await bot.add_cog(SongGuesserCog(bot))
