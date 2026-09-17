from __future__ import annotations

import random
import string

import discord
from discord.ext import commands

from .storage import get_guild_scores, save_guild_scores, ranking_text


CATEGORIES = ["Stadt", "Land", "Fluss", "Tier", "Beruf", "Vorname"]


class SLFModal(discord.ui.Modal, title="Stadt, Land, Fluss"):
    stadt = discord.ui.TextInput(label="Stadt", max_length=40, required=False)
    land = discord.ui.TextInput(label="Land", max_length=40, required=False)
    fluss = discord.ui.TextInput(label="Fluss", max_length=40, required=False)
    tier = discord.ui.TextInput(label="Tier", max_length=40, required=False)
    beruf = discord.ui.TextInput(label="Beruf", max_length=40, required=False)

    def __init__(self, cog, guild_id, letter):
        super().__init__()
        self.cog = cog
        self.guild_id = guild_id
        self.letter = letter

    async def on_submit(self, interaction):
        values = {
            "Stadt": self.stadt.value,
            "Land": self.land.value,
            "Fluss": self.fluss.value,
            "Tier": self.tier.value,
            "Beruf": self.beruf.value,
        }
        valid = sum(
            bool(value.strip()) and value.strip()[0].casefold() == self.letter.casefold()
            for value in values.values()
        )
        all_scores, scores = get_guild_scores("stadtLandFlussScores.json", self.guild_id)
        uid = str(interaction.user.id)
        scores.setdefault(uid, {"name": interaction.user.display_name, "points": 0, "rounds": 0})
        scores[uid]["name"] = interaction.user.display_name
        scores[uid]["points"] += valid
        scores[uid]["rounds"] += 1
        save_guild_scores("stadtLandFlussScores.json", all_scores)

        await interaction.response.send_message(
            f"🌍 Runde beendet! Du hast **{valid} Punkte** bekommen.",
            ephemeral=True,
        )


class SLFView(discord.ui.View):
    def __init__(self, cog, guild_id, letter):
        super().__init__(timeout=180)
        self.cog = cog
        self.guild_id = guild_id
        self.letter = letter

    @discord.ui.button(label="Antworten", emoji="✍️", style=discord.ButtonStyle.primary)
    async def answer(self, interaction, button):
        await interaction.response.send_modal(SLFModal(self.cog, self.guild_id, self.letter))

    @discord.ui.button(label="Stop", emoji="🛑", style=discord.ButtonStyle.danger)
    async def stop(self, interaction, button):
        self.cog.active.pop(self.guild_id, None)
        await interaction.response.send_message("🛑 **Stadt, Land, Fluss beendet.**")


class SLFCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.active = {}

    async def start(self, interaction):
        if interaction.guild.id in self.active:
            await interaction.response.send_message("❌ Eine Runde läuft bereits.", ephemeral=True)
            return

        letter = random.choice(string.ascii_uppercase)
        self.active[interaction.guild.id] = letter

        embed = discord.Embed(
            title="🌍 Stadt, Land, Fluss",
            description=(
                f"Der Buchstabe ist **{letter}**.\n\n"
                + "\n".join(f"• **{c}**" for c in CATEGORIES)
                + "\n\nDrücke **Antworten** und fülle die Felder aus."
            ),
        )
        await interaction.response.send_message(embed=embed, view=SLFView(self, interaction.guild.id, letter))

    async def stop(self, interaction):
        self.active.pop(interaction.guild.id, None)
        await interaction.response.send_message("🛑 **Stadt, Land, Fluss beendet.**")

    async def rank(self, interaction):
        _, scores = get_guild_scores("stadtLandFlussScores.json", interaction.guild.id)
        await interaction.response.send_message("🏆 **STADT-LAND-FLUSS-RANGLISTE**\n\n" + ranking_text(scores))

    async def reset(self, interaction):
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("❌ Dafür brauchst du Administrator-Rechte.", ephemeral=True)
            return
        all_scores, _ = get_guild_scores("stadtLandFlussScores.json", interaction.guild.id)
        all_scores[str(interaction.guild.id)] = {}
        save_guild_scores("stadtLandFlussScores.json", all_scores)
        await interaction.response.send_message("🔄 **Stadt-Land-Fluss-Rangliste zurückgesetzt!**")


async def setup(bot):
    await bot.add_cog(SLFCog(bot))
