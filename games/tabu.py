from __future__ import annotations

import asyncio
import json
import random

import discord
from discord.ext import commands

from .storage import ROOT, get_guild_scores, save_guild_scores, ranking_text


class TabuGame:
    def __init__(self, cog, guild_id, channel):
        self.cog = cog
        self.guild_id = guild_id
        self.channel = channel
        self.players = []
        self.running = True
        self.round_active = False
        self.explainer_index = 0
        self.current_explainer = None
        self.current_card = None
        self.used = set()

    async def lobby(self):
        return await self.channel.send(
            embed=self.embed(),
            view=TabuLobbyView(self),
        )

    def embed(self):
        players = "\n".join(f"{i+1}. <@{uid}>" for i, uid in enumerate(self.players)) or "Noch niemand beigetreten."
        return discord.Embed(
            title="🚫 TABU – Lobby",
            description=f"👥 **Spieler**\n\n{players}\n\n👥 **{len(self.players)} Spieler**\n\nMindestens **2 Spieler** werden benötigt.",
        )

    async def update_lobby(self, message):
        await message.edit(embed=self.embed(), view=TabuLobbyView(self))

    async def start_round(self, message):
        if len(self.players) < 2:
            await message.channel.send("❌ Mindestens **2 Spieler** werden benötigt.")
            return
        self.round_active = True
        self.current_explainer = self.players[self.explainer_index % len(self.players)]
        self.current_card = self.get_card()
        embed = discord.Embed(
            title="🚫 TABU",
            description=f"🎤 Erklärer: <@{self.current_explainer}>\n\n**Gesuchtes Wort:** ||{self.current_card['word']}||\n\nVerbotene Wörter:\n" +
                        "\n".join(f"• {x}" for x in self.current_card["taboo"]),
        )
        await message.edit(content=None, embed=embed, view=TabuRoundView(self))

    def get_card(self):
        if len(self.used) >= len(self.cog.words):
            self.used.clear()
        available = [i for i in range(len(self.cog.words)) if i not in self.used]
        idx = random.choice(available)
        self.used.add(idx)
        return self.cog.words[idx]

    async def skip(self, interaction):
        if interaction.user.id != self.current_explainer:
            await interaction.response.send_message("❌ Nur der Erklärer kann überspringen.", ephemeral=True)
            return
        await interaction.response.send_message("⏭️ Runde übersprungen.")
        await self.next_round(interaction.channel)

    async def guess(self, interaction):
        if interaction.user.id == self.current_explainer:
            await interaction.response.send_message("❌ Der Erklärer darf nicht selbst raten.", ephemeral=True)
            return
        await interaction.response.send_modal(TabuGuessModal(self))

    async def submit_guess(self, interaction, guess):
        correct = guess.strip().casefold() == self.current_card["word"].strip().casefold()
        if correct:
            all_scores, scores = get_guild_scores("tabuScores.json", self.guild_id)
            uid = str(interaction.user.id)
            scores.setdefault(uid, {"name": interaction.user.display_name, "points": 0, "correct": 0, "rounds": 0})
            scores[uid]["name"] = interaction.user.display_name
            scores[uid]["points"] += 1
            scores[uid]["correct"] += 1
            scores[uid]["rounds"] += 1
            save_guild_scores("tabuScores.json", all_scores)
            await interaction.response.send_message("✅ **Richtig! +1 Punkt** 🎉")
            await self.next_round(interaction.channel)
        else:
            await interaction.response.send_message("❌ Falsch.", ephemeral=True)

    async def next_round(self, channel):
        if not self.running:
            return
        self.explainer_index = (self.explainer_index + 1) % max(1, len(self.players))
        await asyncio.sleep(1)
        if self.players:
            card = self.get_card()
            self.current_card = card
            self.current_explainer = self.players[self.explainer_index]
            embed = discord.Embed(
                title="🚫 TABU",
                description=f"🎤 Erklärer: <@{self.current_explainer}>\n\n**Gesuchtes Wort:** ||{card['word']}||\n\nVerbotene Wörter:\n" +
                            "\n".join(f"• {x}" for x in card["taboo"]),
            )
            await channel.send(embed=embed, view=TabuRoundView(self))

    async def stop(self):
        self.running = False
        self.round_active = False


class TabuLobbyView(discord.ui.View):
    def __init__(self, game):
        super().__init__(timeout=600)
        self.game = game

    @discord.ui.button(label="Mitspielen", emoji="👥", style=discord.ButtonStyle.success, custom_id="tabu_join")
    async def join(self, interaction, button):
        if interaction.user.id not in self.game.players:
            self.game.players.append(interaction.user.id)
        await interaction.response.send_message("✅ **Du bist dabei!**", ephemeral=True)

    @discord.ui.button(label="Runde starten", emoji="▶️", style=discord.ButtonStyle.primary, custom_id="tabu_begin")
    async def begin(self, interaction, button):
        if interaction.user.id not in self.game.players:
            self.game.players.append(interaction.user.id)
        await interaction.response.defer()
        await self.game.start_round(interaction.message)

    @discord.ui.button(label="Stop", emoji="🛑", style=discord.ButtonStyle.danger, custom_id="tabu_stop")
    async def stop(self, interaction, button):
        await self.game.stop()
        await interaction.response.send_message("🛑 **Tabu beendet.**")


class TabuRoundView(discord.ui.View):
    def __init__(self, game):
        super().__init__(timeout=600)
        self.game = game

    @discord.ui.button(label="Wort erraten", style=discord.ButtonStyle.success, custom_id="tabu_correct")
    async def guess(self, interaction, button):
        await self.game.guess(interaction)

    @discord.ui.button(label="Überspringen", style=discord.ButtonStyle.secondary, custom_id="tabu_skip")
    async def skip(self, interaction, button):
        await self.game.skip(interaction)


class TabuGuessModal(discord.ui.Modal, title="Tabu – Wort erraten"):
    answer = discord.ui.TextInput(label="Deine Antwort", max_length=100)

    def __init__(self, game):
        super().__init__()
        self.game = game

    async def on_submit(self, interaction):
        await self.game.submit_guess(interaction, self.answer.value)


class TabuCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.games = {}
        path = ROOT / "data" / "tabu" / "tabuWords.json"
        self.words = json.loads(path.read_text(encoding="utf-8"))

    async def start(self, interaction):
        if interaction.guild.id in self.games and self.games[interaction.guild.id].running:
            await interaction.response.send_message("❌ Tabu läuft bereits.", ephemeral=True)
            return
        game = TabuGame(self, interaction.guild.id, interaction.channel)
        self.games[interaction.guild.id] = game
        await interaction.response.send_message("🚫 **TABU GESTARTET!**")
        await game.lobby()

    async def stop(self, interaction):
        game = self.games.get(interaction.guild.id)
        if game:
            await game.stop()
        await interaction.response.send_message("🛑 **Tabu beendet.**")

    async def rank(self, interaction):
        _, scores = get_guild_scores("tabuScores.json", interaction.guild.id)
        await interaction.response.send_message("🏆 **TABU-RANGLISTE**\n\n" + ranking_text(scores))

    async def reset(self, interaction):
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("❌ Dafür brauchst du Administrator-Rechte.", ephemeral=True)
            return
        all_scores, _ = get_guild_scores("tabuScores.json", interaction.guild.id)
        all_scores[str(interaction.guild.id)] = {}
        save_guild_scores("tabuScores.json", all_scores)
        await interaction.response.send_message("🔄 **Tabu-Rangliste zurückgesetzt!**")


async def setup(bot):
    await bot.add_cog(TabuCog(bot))
