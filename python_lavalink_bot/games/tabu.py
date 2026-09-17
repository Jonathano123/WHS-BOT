import random
import discord
from discord.ext import commands

CARDS = [
    ("Pizza", ["Käse", "Teig", "Italien", "Tomate", "Essen"]),
    ("Schule", ["Lehrer", "Unterricht", "Klasse", "Schüler", "Lernen"]),
    ("Fußball", ["Ball", "Tor", "Spieler", "Sport", "Rasen"]),
]

async def start_tabu(interaction):
    word, forbidden = random.choice(CARDS)
    await interaction.response.send_message(
        f"📝 **Tabu**\n\nErkläre **{word}**, ohne diese Wörter zu verwenden:\n" +
        " • ".join(forbidden)
    )

class TabuCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
