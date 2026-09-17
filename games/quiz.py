from __future__ import annotations

import asyncio
import json
import random
from pathlib import Path

import discord
from discord.ext import commands

from .storage import get_guild_scores, save_guild_scores, ranking_text, ROOT


class QuizGame:
    def __init__(self, cog: "QuizCog", guild_id: int, channel: discord.TextChannel):
        self.cog = cog
        self.guild_id = guild_id
        self.channel = channel
        self.running = True
        self.remaining = list(cog.questions)
        self.current = None
        self.answered = set()
        self.message = None
        self.timer = None

    async def start(self):
        await self.next_question()

    async def next_question(self):
        if not self.running:
            return
        if not self.remaining:
            self.running = False
            await self.channel.send("🏁 **QUIZ BEENDET!**\n\n🏆 **ENDRANGLISTE**\n\n" + self.cog.rank_text(self.guild_id))
            return

        self.current = self.remaining.pop(random.randrange(len(self.remaining)))
        self.answered.clear()

        embed = discord.Embed(
            title="❓ Quizfrage",
            description=(
                f"**{self.current['question']}**\n\n"
                f"🇦 {self.current['answers'][0]}\n\n"
                f"🇧 {self.current['answers'][1]}\n\n"
                f"🇨 {self.current['answers'][2]}\n\n"
                f"🇩 {self.current['answers'][3]}"
            ),
        )
        embed.set_footer(text="⏱️ 30 Sekunden Zeit")

        view = QuizAnswerView(self)
        self.message = await self.channel.send(embed=embed, view=view)

        if self.timer:
            self.timer.cancel()
        self.timer = asyncio.create_task(self.timeout())

    async def timeout(self):
        try:
            await asyncio.sleep(30)
            if not self.running or not self.current:
                return
            if self.message:
                try:
                    await self.message.edit(view=QuizAnswerView(self, disabled=True))
                except discord.HTTPException:
                    pass
            answer = self.current["answers"][self.current["correct"]]
            await self.channel.send(f"⏱️ **Zeit vorbei!**\nDie richtige Antwort war **{answer}**.\n\n➡️ Nächste Frage kommt in **5 Sekunden**...")
            self.current = None
            await asyncio.sleep(5)
            await self.next_question()
        except asyncio.CancelledError:
            pass

    async def answer(self, interaction: discord.Interaction, index: int):
        if not self.running or not self.current:
            await interaction.response.send_message("❌ Das Quiz läuft momentan nicht.", ephemeral=True)
            return
        if interaction.user.id in self.answered:
            await interaction.response.send_message("⚠️ Du hast diese Frage bereits beantwortet.", ephemeral=True)
            return

        self.answered.add(interaction.user.id)
        correct = index == self.current["correct"]

        all_scores, scores = get_guild_scores("quizScores.json", self.guild_id)
        uid = str(interaction.user.id)
        scores.setdefault(uid, {"name": interaction.user.display_name, "points": 0})
        scores[uid]["name"] = interaction.user.display_name

        if correct:
            scores[uid]["points"] += 1
            save_guild_scores("quizScores.json", all_scores)
            await interaction.response.send_message("✅ **Richtig! +1 Punkt** 🎉", ephemeral=True)
        else:
            save_guild_scores("quizScores.json", all_scores)
            answer = self.current["answers"][self.current["correct"]]
            await interaction.response.send_message(f"❌ **Falsch!**\nDie richtige Antwort ist **{answer}**.", ephemeral=True)


class QuizAnswerView(discord.ui.View):
    def __init__(self, game: QuizGame, disabled: bool = False):
        super().__init__(timeout=None)
        labels = ["🇦", "🇧", "🇨", "🇩"]
        for i, label in enumerate(labels):
            button = discord.ui.Button(
                label=label,
                style=discord.ButtonStyle.secondary if disabled else discord.ButtonStyle.primary,
                custom_id=f"quiz_answer_{i}",
                disabled=disabled,
            )
            async def callback(interaction, idx=i):
                await game.answer(interaction, idx)
            button.callback = callback
            self.add_item(button)


class QuizCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.games = {}
        path = ROOT / "data" / "quiz" / "questions.json"
        self.questions = json.loads(path.read_text(encoding="utf-8"))

    def rank_text(self, guild_id: int):
        _, scores = get_guild_scores("quizScores.json", guild_id)
        return ranking_text(scores)

    async def start(self, interaction: discord.Interaction):
        if interaction.guild.id in self.games and self.games[interaction.guild.id].running:
            await interaction.response.send_message("❌ Das Quiz läuft bereits.", ephemeral=True)
            return
        game = QuizGame(self, interaction.guild.id, interaction.channel)
        self.games[interaction.guild.id] = game
        await interaction.response.send_message("🎮 **Quiz gestartet!**")
        await game.start()

    async def stop(self, interaction):
        game = self.games.get(interaction.guild.id)
        if not game or not game.running:
            await interaction.response.send_message("❌ Das Quiz läuft momentan nicht.", ephemeral=True)
            return
        game.running = False
        if game.timer:
            game.timer.cancel()
        await interaction.response.send_message("🛑 **Quiz gestoppt.**")

    async def rank(self, interaction):
        await interaction.response.send_message("🏆 **QUIZ-RANGLISTE**\n\n" + self.rank_text(interaction.guild.id))

    async def reset(self, interaction):
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("❌ Dafür brauchst du Administrator-Rechte.", ephemeral=True)
            return
        all_scores, _ = get_guild_scores("quizScores.json", interaction.guild.id)
        all_scores[str(interaction.guild.id)] = {}
        save_guild_scores("quizScores.json", all_scores)
        await interaction.response.send_message("🔄 **Quiz-Rangliste zurückgesetzt!**")

    async def cog_unload(self):
        for game in self.games.values():
            if game.timer:
                game.timer.cancel()


async def setup(bot):
    await bot.add_cog(QuizCog(bot))
