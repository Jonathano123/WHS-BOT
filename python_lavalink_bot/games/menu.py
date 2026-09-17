import discord
from .imposter import start_imposter
from .quiz import start_quiz
from .tabu import start_tabu
from .stadt_land_fluss import start_stadt_land_fluss
from .song_guesser import start_song_guesser

class GamesView(discord.ui.View):
    def __init__(self, bot):
        super().__init__(timeout=180)
        self.bot = bot

    @discord.ui.button(label="🕵️ Imposter", style=discord.ButtonStyle.primary)
    async def imposter(self, interaction, button):
        await start_imposter(interaction)

    @discord.ui.button(label="🧠 Quiz", style=discord.ButtonStyle.primary)
    async def quiz(self, interaction, button):
        await start_quiz(interaction)

    @discord.ui.button(label="📝 Tabu", style=discord.ButtonStyle.primary)
    async def tabu(self, interaction, button):
        await start_tabu(interaction)

    @discord.ui.button(label="🌍 Stadt-Land-Fluss", style=discord.ButtonStyle.primary)
    async def slf(self, interaction, button):
        await start_stadt_land_fluss(interaction)

    @discord.ui.button(label="🎵 Song Guesser", style=discord.ButtonStyle.success)
    async def song(self, interaction, button):
        await start_song_guesser(interaction)
