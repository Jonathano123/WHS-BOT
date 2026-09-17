import discord

GAME_NAMES = {
    "imposter": "🕵️ Imposter",
    "quiz": "❓ Quiz",
    "tabu": "🚫 Tabu",
    "stadtlandfluss": "🌍 Stadt, Land, Fluss",
    "songguesser": "🎵 Song Guesser",
}


class GameMenu(discord.ui.Select):
    def __init__(self):
        options = [
            discord.SelectOption(label="Imposter", description="Das Imposter-Spiel", emoji="🕵️", value="imposter"),
            discord.SelectOption(label="Quiz", description="Beantworte Fragen", emoji="❓", value="quiz"),
            discord.SelectOption(label="Tabu", description="Erkläre Begriffe", emoji="🚫", value="tabu"),
            discord.SelectOption(label="Stadt, Land, Fluss", description="Wörter mit einem Buchstaben", emoji="🌍", value="stadtlandfluss"),
            discord.SelectOption(label="Song Guesser", description="Errate Songs", emoji="🎵", value="songguesser"),
        ]
        super().__init__(
            placeholder="🎮 Spiel auswählen...",
            custom_id="games_select",
            options=options,
        )

    async def callback(self, interaction: discord.Interaction):
        game = self.values[0]
        await interaction.response.edit_message(
            embed=discord.Embed(
                title=f"{GAME_NAMES[game]} – Steuerung",
                description="▶️ **Play** – Spiel starten\n\n🛑 **Stop** – Spiel beenden\n\n🏆 **Rank** – Rangliste\n\n🔄 **Reset** – Punkte zurücksetzen",
            ),
            view=GameActionsView(game),
        )


class GameMenuView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=180)
        self.add_item(GameMenu())


class GameActionsView(discord.ui.View):
    def __init__(self, game: str):
        super().__init__(timeout=180)
        self.game = game

        for label, emoji, style, action in [
            ("Play", "▶️", discord.ButtonStyle.success, "play"),
            ("Stop", "🛑", discord.ButtonStyle.danger, "stop"),
            ("Rank", "🏆", discord.ButtonStyle.primary, "rank"),
            ("Reset", "🔄", discord.ButtonStyle.secondary, "reset"),
        ]:
            button = discord.ui.Button(
                label=label,
                emoji=emoji,
                style=style,
                custom_id=f"games_{action}_{game}",
            )

            async def callback(interaction: discord.Interaction, action=action):
                await dispatch_game_action(interaction, self.game, action)

            button.callback = callback
            self.add_item(button)


async def dispatch_game_action(interaction: discord.Interaction, game: str, action: str):
    from .imposter import ImposterCog
    from .quiz import QuizCog
    from .tabu import TabuCog
    from .stadt_land_fluss import SLFCog
    from .song_guesser import SongGuesserCog

    mapping = {
        "imposter": ImposterCog,
        "quiz": QuizCog,
        "tabu": TabuCog,
        "stadtlandfluss": SLFCog,
        "songguesser": SongGuesserCog,
    }

    cog_cls = mapping[game]
    cog = interaction.client.get_cog(cog_cls.__name__)

    if cog is None:
        await interaction.response.send_message("❌ Das Spiel ist momentan nicht geladen.", ephemeral=True)
        return

    method = getattr(cog, action, None)
    if method is None:
        await interaction.response.send_message("❌ Diese Aktion ist nicht verfügbar.", ephemeral=True)
        return

    await method(interaction)
