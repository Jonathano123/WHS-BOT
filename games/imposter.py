from __future__ import annotations

import json
import random
import asyncio

import discord
from discord.ext import commands

from .storage import ROOT, get_guild_scores, save_guild_scores, ranking_text


class ImposterGame:
    def __init__(self, cog, guild_id, channel, leader_id):
        self.cog = cog
        self.guild_id = guild_id
        self.channel = channel
        self.leader_id = leader_id
        self.players = []
        self.running = True
        self.started = False
        self.word = None
        self.hint = None
        self.imposter_id = None
        self.order = []
        self.index = 0
        self.votes = {}
        self.final_guess_used = False

    def lobby_embed(self):
        players = "\n".join(f"• <@{p}>" for p in self.players) or "Noch niemand beigetreten."
        return discord.Embed(
            title="🕵️ Imposter",
            description=f"**Neue Imposter-Lobby**\n\n👑 Leader: <@{self.leader_id}>\n\n👥 Spieler: **{len(self.players)}**\n\n{players}\n\nMindestens **3 Spieler** werden benötigt.",
        )

    async def start(self, interaction):
        if interaction.user.id != self.leader_id:
            await interaction.response.send_message("❌ Nur der Leader kann das Spiel starten.", ephemeral=True)
            return
        if len(self.players) < 3:
            await interaction.response.send_message("❌ Es werden mindestens 3 Spieler benötigt.", ephemeral=True)
            return

        word = random.choice(self.cog.words)
        self.word = word["word"]
        self.hint = word["hint"]
        self.imposter_id = random.choice(self.players)
        self.order = random.sample(self.players, len(self.players))
        self.index = 0
        self.started = True
        self.votes = {}
        self.final_guess_used = False

        await interaction.response.edit_message(
            content="🎮 **Das Imposter-Spiel wurde gestartet!**",
            embed=None,
            view=None,
        )
        await self.channel.send("🔐 **Geheime Rollen sind bereit.** Klicke auf **Geheimwort anzeigen**.", view=SecretView(self))
        await self.channel.send(
            f"🕵️ **Der Imposter hat einen letzten Versuch:** Klicke auf **Imposter-Raten**.",
            view=ImposterGuessView(self),
        )
        await self.next_speaker()

    async def next_speaker(self):
        if self.index >= len(self.order):
            await self.channel.send(
                "🗳️ **Alle Spieler waren dran.**\nDer Leader kann jetzt die Abstimmung starten.",
                view=VoteStartView(self),
            )
            return
        uid = self.order[self.index]
        await self.channel.send(
            f"🎤 **<@{uid}> ist an der Reihe!**\nDu hast 30 Sekunden.",
            view=NextSpeakerView(self, uid),
        )

    async def continue_speaker(self, interaction):
        if interaction.user.id != self.order[self.index]:
            await interaction.response.send_message("❌ Du bist gerade nicht dran.", ephemeral=True)
            return
        self.index += 1
        await interaction.response.send_message("➡️ Weiter.", ephemeral=True)
        await self.next_speaker()

    async def secret(self, interaction):
        if interaction.user.id not in self.players:
            await interaction.response.send_message("❌ Du bist nicht im Spiel.", ephemeral=True)
            return
        if interaction.user.id == self.imposter_id:
            await interaction.response.send_message(f"🕵️ Du bist der **IMPOSTER**!\nDein Hilfswort: **{self.hint}**", ephemeral=True)
        else:
            await interaction.response.send_message(f"🔐 Dein Geheimwort ist:\n**{self.word}**", ephemeral=True)

    async def guess(self, interaction):
        if interaction.user.id != self.imposter_id:
            await interaction.response.send_message("❌ Nur der Imposter kann das tun.", ephemeral=True)
            return
        await interaction.response.send_modal(ImposterGuessModal(self))

    async def submit_guess(self, interaction, guess):
        if self.final_guess_used:
            await interaction.response.send_message("❌ Der letzte Versuch wurde bereits benutzt.", ephemeral=True)
            return
        self.final_guess_used = True
        if guess.strip().casefold() == self.word.strip().casefold():
            add_score(self.guild_id, interaction.user.id, 3, interaction.user.display_name)
            await interaction.response.send_message("🎯 **Richtig! Der Imposter hat das Wort erraten. +3 Punkte**")
        else:
            await interaction.response.send_message(f"❌ Falsch. Das Wort war **{self.word}**.")
        await self.finish_round()

    async def start_voting(self, interaction):
        if interaction.user.id != self.leader_id:
            await interaction.response.send_message("❌ Nur der Leader kann die Abstimmung starten.", ephemeral=True)
            return
        self.votes = {}
        await interaction.response.send_message("🗳️ **Abstimmung gestartet!**", view=VoteView(self))

    async def vote(self, interaction, target):
        if target not in self.players:
            await interaction.response.send_message("❌ Ungültiger Spieler.", ephemeral=True)
            return
        self.votes[interaction.user.id] = target
        await interaction.response.send_message(f"🗳️ Deine Stimme für <@{target}> wurde gespeichert.", ephemeral=True)
        if len(self.votes) >= len(self.players):
            await self.finish_vote()

    async def finish_vote(self):
        counts = {}
        for target in self.votes.values():
            counts[target] = counts.get(target, 0) + 1
        if not counts:
            await self.finish_round()
            return
        target = max(counts, key=counts.get)
        if target == self.imposter_id:
            add_score(self.guild_id, target, 2, str(target))
            text = f"🎉 **Der Imposter wurde gefunden:** <@{target}>\n**+2 Punkte**"
        else:
            text = f"❌ **Falsche Abstimmung.** Der Imposter war <@{self.imposter_id}>."
        await self.channel.send(text)
        await self.finish_round()

    async def finish_round(self):
        self.started = False
        await self.channel.send(
            f"🏁 **Runde beendet.**\nDas Wort war **{self.word}**.\n\n"
            "Der Leader kann eine neue Runde starten.",
            view=NewRoundView(self),
        )

    async def new_round(self, interaction):
        if interaction.user.id != self.leader_id:
            await interaction.response.send_message("❌ Nur der Leader kann eine neue Runde starten.", ephemeral=True)
            return
        await interaction.response.defer()
        await self.start_from_button()

    async def start_from_button(self):
        word = random.choice(self.cog.words)
        self.word = word["word"]
        self.hint = word["hint"]
        self.imposter_id = random.choice(self.players)
        self.order = random.sample(self.players, len(self.players))
        self.index = 0
        self.votes = {}
        self.final_guess_used = False
        self.started = True
        await self.channel.send("🆕 **Neue Runde!**", view=SecretView(self))
        await self.channel.send("🕵️ **Imposter-Raten**", view=ImposterGuessView(self))
        await self.next_speaker()

    async def stop(self):
        self.running = False
        self.started = False


def add_score(guild_id, user_id, points, name):
    all_scores, scores = get_guild_scores("imposterScores.json", guild_id)
    uid = str(user_id)
    scores[uid] = scores.get(uid, 0) + points
    save_guild_scores("imposterScores.json", all_scores)


class LobbyView(discord.ui.View):
    def __init__(self, game):
        super().__init__(timeout=600)
        self.game = game

    @discord.ui.button(label="Beitreten", emoji="👥", style=discord.ButtonStyle.success)
    async def join(self, interaction, button):
        if interaction.user.id not in self.game.players:
            self.game.players.append(interaction.user.id)
        await interaction.response.edit_message(embed=self.game.lobby_embed(), view=self)

    @discord.ui.button(label="Verlassen", emoji="🚪", style=discord.ButtonStyle.secondary)
    async def leave(self, interaction, button):
        if interaction.user.id in self.game.players:
            self.game.players.remove(interaction.user.id)
        await interaction.response.edit_message(embed=self.game.lobby_embed(), view=self)

    @discord.ui.button(label="Starten", emoji="▶️", style=discord.ButtonStyle.primary)
    async def start(self, interaction, button):
        await self.game.start(interaction)


class SecretView(discord.ui.View):
    def __init__(self, game):
        super().__init__(timeout=180)
        self.game = game

    @discord.ui.button(label="Geheimwort anzeigen", emoji="🔐", style=discord.ButtonStyle.primary)
    async def secret(self, interaction, button):
        await self.game.secret(interaction)


class ImposterGuessView(discord.ui.View):
    def __init__(self, game):
        super().__init__(timeout=180)
        self.game = game

    @discord.ui.button(label="Imposter-Raten", emoji="🕵️", style=discord.ButtonStyle.danger)
    async def guess(self, interaction, button):
        await self.game.guess(interaction)


class NextSpeakerView(discord.ui.View):
    def __init__(self, game, speaker):
        super().__init__(timeout=60)
        self.game = game
        self.speaker = speaker

    @discord.ui.button(label="Weiter", emoji="➡️", style=discord.ButtonStyle.primary)
    async def next(self, interaction, button):
        await self.game.continue_speaker(interaction)


class VoteStartView(discord.ui.View):
    def __init__(self, game):
        super().__init__(timeout=300)
        self.game = game

    @discord.ui.button(label="Jetzt abstimmen", emoji="🗳️", style=discord.ButtonStyle.danger)
    async def vote(self, interaction, button):
        await self.game.start_voting(interaction)


class VoteView(discord.ui.View):
    def __init__(self, game):
        super().__init__(timeout=300)
        self.game = game
        options = [
            discord.SelectOption(label=f"Spieler {i+1}", value=str(uid))
            for i, uid in enumerate(game.players[:25])
        ]
        select = discord.ui.Select(placeholder="Imposter auswählen...", options=options)
        async def callback(interaction):
            await self.game.vote(interaction, int(select.values[0]))
        select.callback = callback
        self.add_item(select)


class NewRoundView(discord.ui.View):
    def __init__(self, game):
        super().__init__(timeout=300)
        self.game = game

    @discord.ui.button(label="Neue Runde", emoji="🆕", style=discord.ButtonStyle.success)
    async def new(self, interaction, button):
        await self.game.new_round(interaction)


class ImposterGuessModal(discord.ui.Modal, title="Imposter – Wort raten"):
    guess = discord.ui.TextInput(label="Dein Tipp", max_length=100)

    def __init__(self, game):
        super().__init__()
        self.game = game

    async def on_submit(self, interaction):
        await self.game.submit_guess(interaction, self.guess.value)


class ImposterCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.games = {}
        path = ROOT / "data" / "imposter" / "words.json"
        self.words = json.loads(path.read_text(encoding="utf-8"))

    async def start(self, interaction):
        if interaction.guild.id in self.games and self.games[interaction.guild.id].running:
            await interaction.response.send_message("❌ Auf diesem Server läuft bereits ein Imposter-Spiel.", ephemeral=True)
            return
        game = ImposterGame(self, interaction.guild.id, interaction.channel, interaction.user.id)
        self.games[interaction.guild.id] = game
        await interaction.response.send_message(embed=game.lobby_embed(), view=LobbyView(game))

    async def stop(self, interaction):
        game = self.games.get(interaction.guild.id)
        if game:
            await game.stop()
            await interaction.response.send_message("🛑 **Imposter-Spiel beendet.**")
        else:
            await interaction.response.send_message("❌ Kein Imposter-Spiel aktiv.", ephemeral=True)

    async def rank(self, interaction):
        _, scores = get_guild_scores("imposterScores.json", interaction.guild.id)
        await interaction.response.send_message("🏆 **IMPOSTER-PUNKTERANGLISTE**\n\n" + ranking_text({k: {"name": k, "points": v} for k,v in scores.items()}))

    async def reset(self, interaction):
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("❌ Dafür brauchst du Administrator-Rechte.", ephemeral=True)
            return
        all_scores, _ = get_guild_scores("imposterScores.json", interaction.guild.id)
        all_scores[str(interaction.guild.id)] = {}
        save_guild_scores("imposterScores.json", all_scores)
        await interaction.response.send_message("🔄 **Imposter-Punkterangliste zurückgesetzt!**")


async def setup(bot):
    await bot.add_cog(ImposterCog(bot))
