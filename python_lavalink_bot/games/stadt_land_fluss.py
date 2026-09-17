import random
import string
import discord
from discord.ext import commands

CATEGORIES = ["Stadt", "Land", "Fluss", "Name", "Tier", "Beruf"]

async def start_stadt_land_fluss(interaction):
    letter = random.choice(string.ascii_uppercase)
    await interaction.response.send_message(
        f"🌍 **Stadt-Land-Fluss**\n\nBuchstabe: **{letter}**\nKategorien: {', '.join(CATEGORIES)}"
    )

class StadtLandFlussCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
