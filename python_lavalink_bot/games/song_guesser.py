import json
import random
import unicodedata
from pathlib import Path
import discord
from discord.ext import commands
import wavelink

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "top1000Songs.json"


def norm(value):
    value = unicodedata.normalize("NFKD", value)
    return "".join(c for c in value if not unicodedata.combining(c)).lower().strip()


def load_songs():
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return []

class SongSearchModal(discord.ui.Modal, title="Song suchen"):
    query = discord.ui.TextInput(label="Titel oder Interpret", max_length=100)
    def __init__(self, game):
        super().__init__()
        self.game = game

    async def on_submit(self, interaction):
        q = norm(self.query.value)
        matches = [s for s in self.game.songs if q in norm(s["title"]) or q in norm(s["artist"])][:25]
        if not matches:
            await interaction.response.send_message("❌ Kein Treffer.", ephemeral=True)
            return
        await interaction.response.send_message(
            "Wähle deinen Tipp:", ephemeral=True, view=SongSelectView(self.game, matches, interaction.user.id)
        )

class SongSelectView(discord.ui.View):
    def __init__(self, game, matches, user_id):
        super().__init__(timeout=120)
        self.game = game
        self.matches = matches
        self.user_id = user_id
        options = [discord.SelectOption(label=s["title"][:100], description=s["artist"][:100], value=str(i)) for i, s in enumerate(matches)]
        select = discord.ui.Select(placeholder="Song auswählen...", options=options)
        select.callback = self.callback
        self.add_item(select)

    async def callback(self, interaction):
        if interaction.user.id != self.user_id:
            await interaction.response.send_message("Diese Suche gehört jemand anderem.", ephemeral=True)
            return
        selected = self.matches[int(interaction.data["values"][0])]
        correct = norm(selected["title"]) == norm(self.game.current["title"]) and norm(selected["artist"]) == norm(self.game.current["artist"])
        if correct:
            self.game.scores[interaction.user.id] = self.game.scores.get(interaction.user.id, 0) + 1
            msg = f"✅ Richtig! **{selected['title']}** – **{selected['artist']}**"
        else:
            msg = "❌ Falsch!"
        await interaction.response.send_message(msg, ephemeral=True)

class SongGuesserView(discord.ui.View):
    def __init__(self, game):
        super().__init__(timeout=180)
        self.game = game
    @discord.ui.button(label="🎵 Song auswählen", style=discord.ButtonStyle.success)
    async def pick(self, interaction, button):
        await interaction.response.send_modal(SongSearchModal(self.game))

async def start_song_guesser(interaction):
    cog = interaction.client.get_cog("SongGuesserCog")
    if cog is None:
        await interaction.response.send_message("Song Guesser ist nicht geladen.", ephemeral=True)
        return
    await cog.start(interaction)

class SongGuesserCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.songs = load_songs()
        self.current = None
        self.scores = {}

    async def start(self, interaction):
        if not self.songs:
            await interaction.response.send_message(
                "⚠️ `data/top1000Songs.json` fehlt noch. Die 1000er-Liste aus deiner bisherigen Version muss hier übernommen werden.", ephemeral=True
            )
            return
        self.current = random.choice(self.songs)
        self.scores = {interaction.user.id: 0}
        embed = discord.Embed(title="🎵 Song Guesser", description="Der Song läuft über Lavalink. Nutze **Song auswählen**, suche Titel/Interpret und tippe.")
        await interaction.response.send_message(embed=embed, view=SongGuesserView(self))
        await self.play_current(interaction)

    async def play_current(self, interaction):
        if not interaction.user.voice or not interaction.user.voice.channel:
            return
        player = interaction.guild.voice_client
        if not isinstance(player, wavelink.Player):
            player = await interaction.user.voice.channel.connect(cls=wavelink.Player)
        elif player.channel != interaction.user.voice.channel:
            await player.move_to(interaction.user.voice.channel)
        query = f"ytsearch:{self.current['artist']} {self.current['title']} official audio"
        results = await wavelink.Playable.search(query)
        if results:
            await player.play(results[0])
