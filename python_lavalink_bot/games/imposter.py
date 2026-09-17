import random
import discord
from discord.ext import commands

WORDS = ["Apfel", "Schule", "Strand", "Fußball", "Kino", "Pizza", "Wald", "Flughafen"]

async def start_imposter(interaction):
    await interaction.response.send_message(
        "🕵️ **Imposter** gestartet!\nFür die vollständige Runde werden die Spieler anschließend über Buttons verwaltet."
    )

class ImposterCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
