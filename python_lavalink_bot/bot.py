import os
import discord
from discord.ext import commands
from dotenv import load_dotenv
import wavelink

from music.lavalink import setup_lavalink
from games.menu import GamesView
from games.imposter import ImposterCog
from games.quiz import QuizCog
from games.tabu import TabuCog
from games.stadt_land_fluss import StadtLandFlussCog
from games.song_guesser import SongGuesserCog

load_dotenv()
TOKEN = os.getenv("DISCORD_TOKEN")

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.voice_states = True

class Bot(commands.Bot):
    async def setup_hook(self):
        await setup_lavalink(self)
        await self.add_cog(ImposterCog(self))
        await self.add_cog(QuizCog(self))
        await self.add_cog(TabuCog(self))
        await self.add_cog(StadtLandFlussCog(self))
        await self.add_cog(SongGuesserCog(self))
        await self.tree.sync()

    async def on_wavelink_node_ready(self, payload):
        print(f"Lavalink bereit: {payload.node.identifier}")

    async def on_wavelink_track_end(self, payload):
        print(f"Lavalink Track beendet: {payload.track.title}")

bot = Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    print(f"Discord verbunden als {bot.user} ({bot.user.id})")

@bot.tree.command(name="games", description="Öffnet das Spiele-Menü")
async def games(interaction: discord.Interaction):
    embed = discord.Embed(
        title="🎮 Spiele",
        description="Wähle eines der fünf Spiele aus."
    )
    await interaction.response.send_message(embed=embed, view=GamesView(bot))

@bot.tree.command(name="help", description="Zeigt die Bot-Hilfe")
async def help_command(interaction: discord.Interaction):
    await interaction.response.send_message(
        "🎮 `/games` öffnet die Spiele.\n"
        "🎵 `/play <suchbegriff>` spielt Audio über Lavalink.\n"
        "⏹️ `/stop` stoppt die Wiedergabe."
    )

@bot.tree.command(name="play", description="Spielt Musik über Lavalink")
async def play(interaction: discord.Interaction, query: str):
    if not interaction.user.voice or not interaction.user.voice.channel:
        await interaction.response.send_message("Du musst in einem Voice-Channel sein.", ephemeral=True)
        return
    await interaction.response.defer()
    try:
        player = interaction.guild.voice_client
        if not isinstance(player, wavelink.Player):
            player = await interaction.user.voice.channel.connect(cls=wavelink.Player)
        elif player.channel != interaction.user.voice.channel:
            await player.move_to(interaction.user.voice.channel)
        results = await wavelink.Playable.search(query)
        if not results:
            await interaction.followup.send("❌ Kein Track gefunden.")
            return
        track = results[0]
        await player.play(track)
        await interaction.followup.send(f"▶️ **{track.title}**")
    except Exception as exc:
        await interaction.followup.send(f"❌ Lavalink-Fehler: `{exc}`")

@bot.tree.command(name="stop", description="Stoppt Musik")
async def stop(interaction: discord.Interaction):
    player = interaction.guild.voice_client
    if isinstance(player, wavelink.Player):
        await player.stop()
        await interaction.response.send_message("⏹️ Gestoppt.")
    else:
        await interaction.response.send_message("Es läuft nichts.", ephemeral=True)

@bot.tree.command(name="leave", description="Verlässt den Voice-Channel")
async def leave(interaction: discord.Interaction):
    player = interaction.guild.voice_client
    if isinstance(player, wavelink.Player):
        await player.disconnect()
        await interaction.response.send_message("👋 Voice-Channel verlassen.")
    else:
        await interaction.response.send_message("Der Bot ist in keinem Voice-Channel.", ephemeral=True)

if __name__ == "__main__":
    if not TOKEN:
        raise RuntimeError("DISCORD_TOKEN fehlt in .env")
    bot.run(TOKEN)
