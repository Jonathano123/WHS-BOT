from __future__ import annotations

import logging
import os
import discord
import wavelink
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

from games.menu import GameMenuView
from games.imposter import ImposterCog
from games.quiz import QuizCog
from games.tabu import TabuCog
from games.stadt_land_fluss import SLFCog
from games.song_guesser import SongGuesserCog
from music.lavalink import connect_nodes, close as close_lavalink, stop as stop_music, disconnect as disconnect_music

load_dotenv()

TOKEN = os.getenv("TOKEN")
CLIENT_ID = 1489292835445407745
GUILD_IDS = [
    714579802790690937,
    1531355499134586970,
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
log = logging.getLogger("bot")

intents = discord.Intents.default()
intents.guilds = True
intents.voice_states = True
intents.message_content = True


class Bot(commands.Bot):
    def __init__(self):
        super().__init__(
            command_prefix="!",
            intents=intents,
            application_id=CLIENT_ID,
        )

    async def setup_hook(self):
        await self.add_cog(ImposterCog(self))
        await self.add_cog(QuizCog(self))
        await self.add_cog(TabuCog(self))
        await self.add_cog(SLFCog(self))
        await self.add_cog(SongGuesserCog(self))
        await connect_nodes(self)

        # Sofortige Guild-Commands für die beiden bisher verwendeten Server.
        for guild_id in GUILD_IDS:
            guild = discord.Object(id=guild_id)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)

        log.info("Slash Commands registriert.")

    async def close(self):
        await close_lavalink()
        await super().close()


bot = Bot()


@bot.event
async def on_ready():
    log.info("Bot online als %s (%s)", bot.user, bot.user.id if bot.user else "?")


@bot.event
async def on_wavelink_node_ready(payload: wavelink.NodeReadyEventPayload):
    log.info("Lavalink verbunden: %s | resumed=%s", payload.node, payload.resumed)


@bot.event
async def on_wavelink_track_start(payload: wavelink.TrackStartEventPayload):
    log.info("Lavalink Track gestartet: %s", payload.track.title)


@bot.tree.command(name="games", description="Öffnet das Spiele-Menü")
async def games(interaction: discord.Interaction):
    embed = discord.Embed(
        title="🎮 Gruppen-Spiele",
        description=(
            "Wähle ein Spiel aus!\n\n"
            "🕵️ **Imposter**\n"
            "Ein Spieler ist der Imposter und muss das geheime Wort erraten.\n\n"
            "❓ **Quiz**\n"
            "Beantworte Fragen so schnell wie möglich.\n\n"
            "🚫 **Tabu**\n"
            "Erkläre ein Wort, ohne die verbotenen Wörter zu benutzen.\n\n"
            "🌍 **Stadt, Land, Fluss**\n"
            "Finde Stadt, Land, Fluss, Tier, Beruf und Vorname.\n\n"
            "🎵 **Song Guesser**\n"
            "Errate den laufenden Song aus der Top-1000-Liste."
        ),
    )
    await interaction.response.send_message(embed=embed, view=GameMenuView())


async def get_cog(interaction, cls):
    cog = interaction.client.get_cog(cls.__name__)
    if cog is None:
        raise RuntimeError(f"{cls.__name__} wurde nicht geladen.")
    return cog


@bot.tree.command(name="quiz", description="Startet das Quiz")
async def quiz(interaction):
    await (await get_cog(interaction, QuizCog)).start(interaction)


@bot.tree.command(name="stop", description="Stoppt das Quiz")
async def stop(interaction):
    await (await get_cog(interaction, QuizCog)).stop(interaction)


@bot.tree.command(name="rank", description="Zeigt die Quiz-Rangliste")
async def rank(interaction):
    await (await get_cog(interaction, QuizCog)).rank(interaction)


@bot.tree.command(name="reset", description="Setzt die Quiz-Rangliste zurück")
async def reset(interaction):
    await (await get_cog(interaction, QuizCog)).reset(interaction)


imposter_group = app_commands.Group(name="imposter", description="Imposter-Spiel")


@imposter_group.command(name="start", description="Startet eine Imposter-Lobby")
async def imposter_start(interaction):
    await (await get_cog(interaction, ImposterCog)).start(interaction)


@imposter_group.command(name="stop", description="Beendet Imposter")
async def imposter_stop(interaction):
    await (await get_cog(interaction, ImposterCog)).stop(interaction)


@imposter_group.command(name="rank", description="Zeigt Imposter-Punkte")
async def imposter_rank(interaction):
    await (await get_cog(interaction, ImposterCog)).rank(interaction)


@imposter_group.command(name="reset", description="Setzt Imposter-Punkte zurück")
async def imposter_reset(interaction):
    await (await get_cog(interaction, ImposterCog)).reset(interaction)


@imposter_group.command(name="help", description="Imposter-Anleitung")
async def imposter_help(interaction):
    await interaction.response.send_message(
        "🕵️ **Imposter – Anleitung**\n\n"
        "1. `/imposter start` erstellt eine Lobby.\n"
        "2. Spieler klicken auf **Beitreten**.\n"
        "3. Ab 3 Spielern kann der Leader starten.\n"
        "4. Normale Spieler bekommen das Geheimwort.\n"
        "5. Der Imposter bekommt ein Hilfswort.\n"
        "6. Danach wird abgestimmt.",
    )


bot.tree.add_command(imposter_group)


@bot.tree.command(name="tabu", description="Startet Tabu")
async def tabu(interaction):
    await (await get_cog(interaction, TabuCog)).start(interaction)


@bot.tree.command(name="stadtlandfluss", description="Startet Stadt, Land, Fluss")
async def stadtlandfluss(interaction):
    await (await get_cog(interaction, SLFCog)).start(interaction)


@bot.tree.command(name="songguesser", description="Startet Song Guesser")
async def songguesser(interaction):
    await (await get_cog(interaction, SongGuesserCog)).start(interaction)


@bot.tree.command(name="musicstop", description="Stoppt die Musik")
async def musicstop(interaction):
    await stop_music(interaction.guild)
    await interaction.response.send_message("⏹️ Musik gestoppt.")


@bot.tree.command(name="leave", description="Bot verlässt den Voice-Channel")
async def leave(interaction):
    await disconnect_music(interaction.guild)
    await interaction.response.send_message("👋 Voice-Channel verlassen.")


if __name__ == "__main__":
    if not TOKEN:
        raise RuntimeError("Die Railway-Variable TOKEN fehlt.")
    bot.run(TOKEN)
