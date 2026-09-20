import os
import logging

import discord
import wavelink
from discord.ext import commands
from dotenv import load_dotenv


load_dotenv()

TOKEN = os.getenv("TOKEN")

if not TOKEN:
    raise RuntimeError(
        "Die Umgebungsvariable DISCORD_TOKEN wurde nicht gefunden."
    )


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger("discord-bot")


class MusicBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()

        super().__init__(
            command_prefix="!",
            intents=intents,
        )

    async def setup_hook(self):
        logger.info("Verbinde mit Lavalink...")

        node = wavelink.Node(
            uri="http://127.0.0.1:2333",
            password="youshallnotpass",
        )

        await wavelink.Pool.connect(
            nodes=[node],
            client=self,
        )

        logger.info("Lavalink-Verbindung hergestellt.")

        synced = await self.tree.sync()
        logger.info("%s Slash Commands synchronisiert.", len(synced))

    async def on_ready(self):
        logger.info(
            "Discord Bot online als %s (%s)",
            self.user,
            self.user.id,
        )


bot = MusicBot()


@bot.tree.command(
    name="ping",
    description="Testet, ob der Bot online ist.",
)
async def ping(interaction: discord.Interaction):
    await interaction.response.send_message(
        "🏓 Pong! Der Bot läuft."
    )


bot.run(TOKEN)
