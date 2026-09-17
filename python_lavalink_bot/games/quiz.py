import random
import discord
from discord.ext import commands

QUESTIONS = [
    ("Wie heißt die Hauptstadt von Deutschland?", ["Berlin", "Hamburg", "München", "Köln"], 0),
    ("Wie viele Kontinente gibt es?", ["5", "6", "7", "8"], 2),
    ("Welcher Planet ist der Erde am nächsten zur Sonne?", ["Venus", "Mars", "Merkur", "Jupiter"], 2),
]

async def start_quiz(interaction):
    q, answers, correct = random.choice(QUESTIONS)
    view = QuizView(answers, correct)
    await interaction.response.send_message(f"🧠 **Quiz**\n\n{q}", view=view)

class QuizView(discord.ui.View):
    def __init__(self, answers, correct):
        super().__init__(timeout=30)
        self.correct = correct
        for i, answer in enumerate(answers):
            button = discord.ui.Button(label=answer, style=discord.ButtonStyle.secondary, custom_id=f"quiz:{i}")
            button.callback = self.answer
            self.add_item(button)

    async def answer(self, interaction):
        choice = int(interaction.data["custom_id"].split(":")[1])
        await interaction.response.send_message("✅ Richtig!" if choice == self.correct else "❌ Falsch!", ephemeral=True)

class QuizCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
