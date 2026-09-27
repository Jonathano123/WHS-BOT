const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const SCORES_FILE = path.join(__dirname, "imposterScores.json");
const WORDS_FILE = path.join(__dirname, "words.json");

const SPEAKER_TIME = 30;
const FINAL_GUESS_TIME = 30;

let words = [];

try {
    if (fs.existsSync(WORDS_FILE)) {
        words = JSON.parse(
            fs.readFileSync(WORDS_FILE, "utf8")
        );
    }
} catch (error) {
    console.error(
        "❌ Fehler beim Laden von words.json:",
        error
    );
}

if (!Array.isArray(words)) {
    words = [];
}

const games = new Map();

// Discord kann das Senden eines Embeds mit 50013 ablehnen, wenn
// dem Bot im Kanal die Berechtigung „Links einbetten“ fehlt.
// Das Spiel darf dadurch nicht stehen bleiben: In diesem Fall
// wird automatisch dieselbe Nachricht als normaler Text gesendet.
async function sendChannelMessage(channel, payload) {
    try {
        return await channel.send(payload);
    } catch (error) {
        if (error?.code === 50013 && payload?.embeds?.length) {
            const embed = payload.embeds[0];
            const title = embed.title ? `**${embed.title}**\n\n` : "";
            const description = embed.description || "";
            return channel.send({
                content: `${title}${description}`.trim(),
                components: payload.components || []
            });
        }
        throw error;
    }
}

const usedWords = new Map();
const modalClients = new WeakSet();


// =====================================================
// PUNKTE
// =====================================================

function loadScores() {
    if (!fs.existsSync(SCORES_FILE)) {
        return {};
    }

    try {
        return JSON.parse(
            fs.readFileSync(SCORES_FILE, "utf8")
        );
    } catch (error) {
        console.error(
            "❌ Fehler beim Laden der Punkte:",
            error
        );

        return {};
    }
}


function saveScores(scores) {
    try {
        fs.writeFileSync(
            SCORES_FILE,
            JSON.stringify(scores, null, 2)
        );
    } catch (error) {
        console.error(
            "❌ Fehler beim Speichern der Punkte:",
            error
        );
    }
}


function addPoints(guildId, userId, points) {
    const scores = loadScores();

    if (!scores[guildId]) {
        scores[guildId] = {};
    }

    if (!scores[guildId][userId]) {
        scores[guildId][userId] = 0;
    }

    scores[guildId][userId] += points;

    saveScores(scores);
}


// =====================================================
// WORTVERGLEICH
// =====================================================

function normalizeGuess(value) {
    return String(value || "")
        .trim()
        .toLocaleLowerCase("de-DE")
        .replace(/ß/g, "ss")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}


// =====================================================
// WORTDATEN
// =====================================================

function getWordData(entry) {
    if (typeof entry === "string") {
        return {
            word: entry,
            hint: "Tipp"
        };
    }

    if (!entry || typeof entry !== "object") {
        return null;
    }

    return {
        word:
            entry.word ||
            entry.main ||
            entry.name,

        hint:
            entry.hint ||
            entry.help ||
            entry.helper ||
            entry.hilfswort ||
            "Tipp"
    };
}


// =====================================================
// ZUFÄLLIGES WORT
// =====================================================

function getRandomWord(guildId) {
    if (words.length === 0) {
        return null;
    }

    if (!usedWords.has(guildId)) {
        usedWords.set(guildId, new Set());
    }

    const used = usedWords.get(guildId);

    if (used.size >= words.length) {
        used.clear();
    }

    const available = [];

    for (const entry of words) {
        const data = getWordData(entry);

        if (!data || !data.word) {
            continue;
        }

        if (!used.has(data.word)) {
            available.push(data);
        }
    }

    if (available.length === 0) {
        used.clear();
        return getRandomWord(guildId);
    }

    const selected =
        available[
            Math.floor(
                Math.random() * available.length
            )
        ];

    used.add(selected.word);

    return selected;
}


// =====================================================
// TIMER
// =====================================================

function clearGameTimer(game) {
    if (game.timer) {
        clearTimeout(game.timer);
        game.timer = null;
    }
}


// =====================================================
// MODAL LISTENER
// =====================================================

function setupModalListener(client) {
    if (modalClients.has(client)) {
        return;
    }

    modalClients.add(client);

    client.on(
        "interactionCreate",
        async interaction => {

            if (!interaction.isModalSubmit()) {
                return;
            }

            if (
                interaction.customId !==
                "imposter_guess_modal"
            ) {
                return;
            }

            try {
                await handleGuessModal(interaction);
            } catch (error) {
                console.error(
                    "❌ Fehler beim Wort erraten:",
                    error
                );

                try {
                    if (
                        !interaction.replied &&
                        !interaction.deferred
                    ) {
                        await interaction.reply({
                            content:
                                "❌ Beim Prüfen des Wortes ist ein Fehler aufgetreten.",
                            flags:
                                MessageFlags.Ephemeral
                        });
                    }
                } catch (e) {}
            }
        }
    );
}


// =====================================================
// LOBBY
// =====================================================

async function createLobby(interaction) {

    const guildId =
        interaction.guild.id;

    if (games.has(guildId)) {

        return interaction.reply({
            content:
                "❌ Auf diesem Server läuft bereits ein Imposter-Spiel.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    const game = {

        guildId,

        channelId:
            interaction.channel.id,

        leaderId:
            interaction.user.id,

        players: [],

        started: false,

        word: null,

        hint: null,

        imposterId: null,

        speakingOrder: [],

        currentSpeaker: 0,

        round: 1,

        waitingForRoundChoice: false,

        waitingForNewGame: false,

        awaitingImposterGuess: false,

        voting: false,

        votes: new Map(),

        timer: null,

        finalGuessTimer: null,

        finalGuessUsed: false
    };

    games.set(
        guildId,
        game
    );

    return sendLobby(
        interaction,
        game
    );
}


// =====================================================
// LOBBY
// =====================================================

async function sendLobby(
    interaction,
    game
) {

    const playerList =
        game.players.length > 0
            ? game.players
                .map(
                    id => `• <@${id}>`
                )
                .join("\n")
            : "Noch niemand beigetreten.";

    const embed =
        new EmbedBuilder()
            .setTitle("🕵️ Imposter")
            .setDescription(
                "**Neue Imposter-Lobby**\n\n" +
                `👑 Leader: <@${game.leaderId}>\n\n` +
                `👥 Spieler: **${game.players.length}**\n\n` +
                `${playerList}\n\n` +
                "Mindestens **3 Spieler** werden benötigt."
            );

    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        "imposter_join"
                    )
                    .setLabel(
                        "Beitreten"
                    )
                    .setEmoji("👥")
                    .setStyle(
                        ButtonStyle.Success
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "imposter_leave"
                    )
                    .setLabel(
                        "Verlassen"
                    )
                    .setEmoji("🚪")
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "imposter_start"
                    )
                    .setLabel(
                        "Starten"
                    )
                    .setEmoji("▶️")
                    .setStyle(
                        ButtonStyle.Primary
                    )
            );

    if (interaction.isButton()) {

        return interaction.update({
            embeds: [embed],
            components: [row]
        });
    }

    return interaction.reply({
        embeds: [embed],
        components: [row]
    });
}


// =====================================================
// LOBBY AKTUALISIEREN
// =====================================================

async function updateLobby(
    interaction,
    game
) {

    const playerList =
        game.players.length > 0
            ? game.players
                .map(
                    id => `• <@${id}>`
                )
                .join("\n")
            : "Noch niemand beigetreten.";

    const embed =
        new EmbedBuilder()
            .setTitle("🕵️ Imposter")
            .setDescription(
                "**Neue Imposter-Lobby**\n\n" +
                `👑 Leader: <@${game.leaderId}>\n\n` +
                `👥 Spieler: **${game.players.length}**\n\n` +
                `${playerList}\n\n` +
                "Mindestens **3 Spieler** werden benötigt."
            );

    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        "imposter_join"
                    )
                    .setLabel(
                        "Beitreten"
                    )
                    .setEmoji("👥")
                    .setStyle(
                        ButtonStyle.Success
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "imposter_leave"
                    )
                    .setLabel(
                        "Verlassen"
                    )
                    .setEmoji("🚪")
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "imposter_start"
                    )
                    .setLabel(
                        "Starten"
                    )
                    .setEmoji("▶️")
                    .setStyle(
                        ButtonStyle.Primary
                    )
            );

    return interaction.update({
        embeds: [embed],
        components: [row]
    });
}


// =====================================================
// SPIEL STARTEN
// =====================================================

async function startGame(interaction) {

    const game =
        games.get(
            interaction.guild.id
        );

    if (!game) {

        return interaction.reply({
            content:
                "❌ Das Spiel existiert nicht mehr.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        interaction.user.id !==
        game.leaderId
    ) {

        return interaction.reply({
            content:
                "❌ Nur der Leader kann das Spiel starten.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        game.players.length < 3
    ) {

        return interaction.reply({
            content:
                "❌ Es werden mindestens 3 Spieler benötigt.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    const selected =
        getRandomWord(
            game.guildId
        );

    if (
        !selected ||
        !selected.word
    ) {

        return interaction.reply({
            content:
                "❌ Es konnten keine Wörter geladen werden.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    game.started = true;

    game.round = 1;

    game.word =
        selected.word;

    game.hint =
        selected.hint;

    game.imposterId =
        game.players[
            Math.floor(
                Math.random() *
                game.players.length
            )
        ];

    game.speakingOrder =
        [...game.players]
            .sort(
                () =>
                    Math.random() - 0.5
            );

    game.currentSpeaker = 0;

    game.waitingForRoundChoice = false;
    game.waitingForNewGame = false;
    game.awaitingImposterGuess = false;
    game.voting = false;
    game.votes.clear();
    game.finalGuessUsed = false;

    clearGameTimer(game);

    if (game.finalGuessTimer) {
        clearTimeout(
            game.finalGuessTimer
        );

        game.finalGuessTimer = null;
    }

    await interaction.update({

        content:
            "🎮 **Das Imposter-Spiel wurde gestartet!**",

        embeds: [],

        components: []
    });

    await sendSecretButton(
        interaction.channel
    );

    await sendImposterGuessMessage(
        interaction.channel,
        game
    );

    await sendNextSpeaker(
        interaction.channel,
        game
    );
}


// =====================================================
// NEUE RUNDE
// =====================================================

async function startCompletelyNewRound(
    interaction
) {

    const game =
        games.get(
            interaction.guild.id
        );

    if (!game) {

        return interaction.reply({
            content:
                "❌ Das Spiel läuft nicht mehr.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        interaction.user.id !==
        game.leaderId
    ) {

        return interaction.reply({
            content:
                "❌ Nur der Leader kann eine neue Runde starten.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        !game.waitingForNewGame
    ) {

        return interaction.reply({
            content:
                "❌ Eine neue Runde kann gerade nicht gestartet werden.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    const selected =
        getRandomWord(
            game.guildId
        );

    if (
        !selected ||
        !selected.word
    ) {

        return interaction.reply({
            content:
                "❌ Es konnte kein neues Wort gefunden werden.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    game.started = true;

    game.round = 1;

    game.word =
        selected.word;

    game.hint =
        selected.hint;

    game.imposterId =
        game.players[
            Math.floor(
                Math.random() *
                game.players.length
            )
        ];

    game.speakingOrder =
        [...game.players]
            .sort(
                () =>
                    Math.random() - 0.5
            );

    game.currentSpeaker = 0;

    game.waitingForRoundChoice = false;
    game.waitingForNewGame = false;
    game.awaitingImposterGuess = false;
    game.voting = false;
    game.votes.clear();
    game.finalGuessUsed = false;

    clearGameTimer(game);

    if (game.finalGuessTimer) {
        clearTimeout(
            game.finalGuessTimer
        );

        game.finalGuessTimer = null;
    }

    await interaction.update({

        content:
            "🆕 **Neue Imposter-Runde!**\n\n" +
            "🆕 Neues Wort\n" +
            "🕵️ Neuer Imposter\n\n" +
            "Die Spieler bleiben gleich.",

        embeds: [],

        components: []
    });

    await sendSecretButton(
        interaction.channel
    );

    await sendImposterGuessMessage(
        interaction.channel,
        game
    );

    await sendNextSpeaker(
        interaction.channel,
        game
    );
}


// =====================================================
// GEHEIME INFO
// =====================================================

async function sendSecretButton(
    channel
) {

    const button =
        new ButtonBuilder()
            .setCustomId(
                "imposter_show_word"
            )
            .setLabel(
                "Meine Rolle anzeigen"
            )
            .setEmoji("🔐")
            .setStyle(
                ButtonStyle.Secondary
            );

    const row =
        new ActionRowBuilder()
            .addComponents(
                button
            );

    await sendChannelMessage(channel, {

        content:
            "🔐 **GEHEIME INFORMATIONEN**\n\n" +
            "Jeder Spieler klickt selbst auf den Button.\n" +
            "Die Antwort ist nur für dich sichtbar.",

        components: [row]
    });
}


// =====================================================
// IMPOSTER BUTTON
// Dieser Button wird bei jeder Spielanzeige mit angezeigt.
// =====================================================

function createImposterGuessButton() {

    return new ButtonBuilder()
        .setCustomId(
            "imposter_guess_word"
        )
        .setLabel(
            "Wort erraten"
        )
        .setEmoji("🎯")
        .setStyle(
            ButtonStyle.Danger
        );
}


// =====================================================
// SPIELER STEUERUNG
// =====================================================

function createSpeakerRow() {

    return new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setCustomId(
                    "imposter_next_speaker"
                )
                .setLabel(
                    "Weiter"
                )
                .setEmoji("➡️")
                .setStyle(
                    ButtonStyle.Primary
                ),

            createImposterGuessButton()
        );
}


// =====================================================
// GEHEIMES WORT ANZEIGEN
// =====================================================

async function showSecretWord(
    interaction
) {

    const game =
        games.get(
            interaction.guild.id
        );

    if (
        !game ||
        !game.started
    ) {

        return interaction.reply({
            content:
                "❌ Das Spiel läuft gerade nicht.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        !game.players.includes(
            interaction.user.id
        )
    ) {

        return interaction.reply({
            content:
                "❌ Du bist kein Spieler.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        interaction.user.id ===
        game.imposterId
    ) {

        return interaction.reply({

            content:
                "🕵️ **DU BIST DER IMPOSTER!**\n\n" +
                "Das Hauptwort wird dir nicht angezeigt.\n\n" +
                "💡 **Dein Hilfswort:**\n\n" +
                `**${game.hint}**\n\n` +
                "🎯 Du kannst jederzeit auf **Wort erraten** klicken.",

            components: [
                new ActionRowBuilder()
                    .addComponents(
                        createImposterGuessButton()
                    )
            ],

            flags:
                MessageFlags.Ephemeral
        });
    }

    return interaction.reply({

        content:
            "🔐 **DEIN WORT**\n\n" +
            `**${game.word}**\n\n` +
            "Du bist **kein Imposter**.\n\n" +
            "Gib beim Reden einen passenden Hinweis, " +
            "aber sage das Wort nicht direkt.",

        flags:
            MessageFlags.Ephemeral
    });
}


// =====================================================
// MODAL
// =====================================================

async function showGuessModal(
    interaction
) {

    setupModalListener(
        interaction.client
    );

    const game =
        games.get(
            interaction.guild.id
        );

    if (!game) {

        return interaction.reply({
            content:
                "❌ Das Spiel läuft nicht mehr.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        interaction.user.id !==
        game.imposterId
    ) {

        return interaction.reply({
            content:
                "❌ Nur der Imposter kann das Wort erraten.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        game.finalGuessUsed
    ) {

        return interaction.reply({
            content:
                "❌ Du hast deinen Versuch für diese Runde bereits benutzt.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        !game.started &&
        !game.awaitingImposterGuess
    ) {

        return interaction.reply({
            content:
                "❌ Du kannst das Wort gerade nicht erraten.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    const modal =
        new ModalBuilder()
            .setCustomId(
                "imposter_guess_modal"
            )
            .setTitle(
                "🎯 Wort erraten"
            );

    const input =
        new TextInputBuilder()
            .setCustomId(
                "imposter_guess_input"
            )
            .setLabel(
                "Was glaubst du ist das Wort?"
            )
            .setPlaceholder(
                "Wort eingeben..."
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(true)
            .setMaxLength(200);

    modal.addComponents(
        new ActionRowBuilder()
            .addComponents(
                input
            )
    );

    return interaction.showModal(
        modal
    );
}


// =====================================================
// WORT PRÜFEN
// =====================================================

async function handleGuessModal(
    interaction
) {

    const game =
        games.get(
            interaction.guild.id
        );

    if (!game) {

        return interaction.reply({
            content:
                "❌ Das Spiel läuft nicht mehr.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        interaction.user.id !==
        game.imposterId
    ) {

        return interaction.reply({
            content:
                "❌ Nur der Imposter darf das Wort erraten.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        game.finalGuessUsed
    ) {

        return interaction.reply({
            content:
                "❌ Dein Versuch wurde bereits benutzt.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    const guess =
        interaction.fields
            .getTextInputValue(
                "imposter_guess_input"
            )
            .trim();

    game.finalGuessUsed = true;

    const correct =
        normalizeGuess(guess) ===
        normalizeGuess(game.word);


    // =================================================
    // FALSCH WÄHREND DES SPIELS
    // =================================================

    if (
        game.started &&
        !correct
    ) {

        return interaction.reply({

            content:
                "❌ **Falsch!**\n\n" +
                "Dein Versuch wurde verbraucht.\n" +
                "Du kannst in dieser Runde nicht noch einmal raten.",

            flags:
                MessageFlags.Ephemeral
        });
    }


    // =================================================
    // RICHTIG
    // =================================================

    if (correct) {

        clearGameTimer(game);

        if (game.finalGuessTimer) {
            clearTimeout(
                game.finalGuessTimer
            );

            game.finalGuessTimer = null;
        }

        addPoints(
            game.guildId,
            game.imposterId,
            3
        );

        game.started = false;
        game.voting = false;
        game.waitingForRoundChoice = false;
        game.waitingForNewGame = true;
        game.awaitingImposterGuess = false;

        await interaction.reply({

            content:
                "🎯 **RICHTIG!**\n\n" +
                `Das Wort war **${game.word}**.\n\n` +
                "😈 **DU GEWINNST ALS IMPOSTER! +3 PUNKTE**",

            flags:
                MessageFlags.Ephemeral
        });

        await sendChannelMessage(interaction.channel, {

            content:
                "🎯 **DER IMPOSTER HAT DAS WORT ERRATEN!**\n\n" +
                `🕵️ Der Imposter war <@${game.imposterId}>.\n\n` +
                `Das Wort war **${game.word}**.\n\n` +
                "🏆 **Der Imposter gewinnt +3 Punkte!**"
        });

        await sendNewRoundButton(
            interaction.channel,
            game
        );

        return;
    }


    // =================================================
    // FALSCH NACH ABSTIMMUNG
    // =================================================

    clearGameTimer(game);

    if (game.finalGuessTimer) {
        clearTimeout(
            game.finalGuessTimer
        );

        game.finalGuessTimer = null;
    }

    game.awaitingImposterGuess = false;
    game.waitingForNewGame = true;

    await interaction.reply({

        content:
            "❌ **Falsch!**\n\n" +
            "🏆 Die normalen Spieler gewinnen.",

        flags:
            MessageFlags.Ephemeral
    });

    await sendChannelMessage(interaction.channel, {

        content:
            "🏆 **DIE NORMALEN SPIELER GEWINNEN!**\n\n" +
            "Der Imposter hat das Wort nicht erraten.\n\n" +
            `Das Wort war **${game.word}**.`
    });

    for (
        const playerId of game.players
    ) {

        if (
            playerId !==
            game.imposterId
        ) {

            addPoints(
                game.guildId,
                playerId,
                2
            );
        }
    }

    await sendNewRoundButton(
        interaction.channel,
        game
    );
}


// =====================================================
// IMPOSTER-AKTION
// Der Imposter hat während der gesamten Runde einen eigenen
// Button zum Erraten des Wortes. Nur der Imposter kann ihn benutzen.
// =====================================================

async function sendImposterGuessMessage(channel, game) {

    const row =
        new ActionRowBuilder()
            .addComponents(
                createImposterGuessButton()
            );

    return sendChannelMessage(channel, {
        embeds: [
            new EmbedBuilder()
                .setTitle("😈 IMPOSTER-AKTION")
                .setDescription(
                    "Der Imposter kann jederzeit versuchen, das geheime Wort zu erraten.\n\n" +
                    "🎯 **Wort erraten**\n" +
                    "Nur der Imposter kann diesen Button benutzen.\n\n" +
                    "⚠️ Pro Runde gibt es nur **einen Versuch**."
                )
        ],
        components: [row]
    });
}


// =====================================================
// LEADER-AKTIONEN NACH EINEM SPIELERGEBNIS
// =====================================================

async function sendNewRoundButton(channel, game) {

    game.waitingForNewGame = true;
    game.started = false;
    game.voting = false;
    game.awaitingImposterGuess = false;

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("imposter_new_game")
                    .setLabel("Neue Runde")
                    .setEmoji("🔄")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("imposter_stop_game")
                    .setLabel("Stop")
                    .setEmoji("🛑")
                    .setStyle(ButtonStyle.Danger)
            );

    return sendChannelMessage(channel, {
        embeds: [
            new EmbedBuilder()
                .setTitle("👑 LEADER-ENTSCHEIDUNG")
                .setDescription(
                    "Die Runde ist beendet.\n\n" +
                    "👑 **Nur der Leader kann entscheiden:**\n\n" +
                    "🔄 **Neue Runde** → neues Wort + neuer Imposter\n" +
                    "🛑 **Stop** → Imposter-Spiel wird beendet"
                )
        ],
        components: [row]
    });
}


async function stopAfterResult(interaction) {

    const game = games.get(interaction.guild.id);

    if (!game) {
        return interaction.reply({
            content: "❌ Das Spiel läuft nicht mehr.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.user.id !== game.leaderId) {
        return interaction.reply({
            content: "❌ Nur der Leader kann das Spiel beenden.",
            flags: MessageFlags.Ephemeral
        });
    }

    clearGameTimer(game);

    if (game.finalGuessTimer) {
        clearTimeout(game.finalGuessTimer);
        game.finalGuessTimer = null;
    }

    games.delete(interaction.guild.id);

    return interaction.update({
        content: "🛑 **Das Imposter-Spiel wurde beendet.**",
        embeds: [],
        components: []
    });
}


// =====================================================
// NÄCHSTER SPIELER
// =====================================================

async function sendNextSpeaker(
    channel,
    game
) {

    if (
        game.currentSpeaker >=
        game.speakingOrder.length
    ) {
        // Alle Spieler waren dran.
        // Jetzt entscheidet NUR der Leader:
        // "Noch eine Runde" oder "Jetzt abstimmen".
        return showRoundChoice(
            channel,
            game
        );
    }

    clearGameTimer(game);

    const speakerId =
        game.speakingOrder[
            game.currentSpeaker
        ];

    let username =
        "Unbekannter Spieler";

    try {

        username =
            (
                await channel.client.users.fetch(
                    speakerId
                )
            ).username;

    } catch (error) {}


    const embed =
        new EmbedBuilder()
            .setTitle(
                "🗣️ NÄCHSTER SPIELER"
            )
            .setDescription(

                `**Runde ${game.round}**\n\n` +

                `Jetzt ist **${username}** an der Reihe.\n\n` +

                `<@${speakerId}> kann seinen Hinweis sagen.\n\n` +

                "Klicke auf **Weiter**, sobald du fertig bist.\n\n" +

                "⏱️ **30 Sekunden**"
            );


    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        "imposter_next_speaker"
                    )
                    .setLabel(
                        "Weiter"
                    )
                    .setEmoji("➡️")
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                createImposterGuessButton()
            );


    const speakerMessage = await sendChannelMessage(channel, {

        embeds: [embed],

        components: [row]
    });


    game.timer =
        setTimeout(
            async () => {

                const currentGame =
                    games.get(
                        game.guildId
                    );

                if (
                    !currentGame ||
                    !currentGame.started
                ) {
                    return;
                }

                if (
                    currentGame.currentSpeaker >=
                    currentGame.speakingOrder.length
                ) {
                    return;
                }

                currentGame.currentSpeaker++;

                try {
                    await speakerMessage.delete();
                } catch (error) {}

                await sendNextSpeaker(
                    channel,
                    currentGame
                );

            },
            SPEAKER_TIME * 1000
        );
}


// =====================================================
// WEITER
// =====================================================

async function nextSpeaker(
    interaction
) {

    const game =
        games.get(
            interaction.guild.id
        );

    if (!game) {

        return interaction.reply({
            content:
                "❌ Das Spiel läuft nicht mehr.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    const currentSpeaker =
        game.speakingOrder[
            game.currentSpeaker
        ];

    if (
        interaction.user.id !==
        currentSpeaker
    ) {

        return interaction.reply({

            content:
                "❌ Nur der Spieler, der gerade dran ist, kann auf Weiter klicken.",

            flags:
                MessageFlags.Ephemeral
        });
    }

    await interaction.deferUpdate();

    clearGameTimer(game);

    game.currentSpeaker++;

    if (
        interaction.message
    ) {

        try {

            await interaction.message.delete();

        } catch (error) {}
    }

    await sendNextSpeaker(
        interaction.channel,
        game
    );
}


// =====================================================
// RUNDENENTSCHEIDUNG
// =====================================================

async function showRoundChoice(
    channel,
    game
) {

    clearGameTimer(game);

    game.waitingForRoundChoice =
        true;

    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        "imposter_next_round"
                    )
                    .setLabel(
                        "Noch eine Runde"
                    )
                    .setEmoji("🔄")
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "imposter_start_voting"
                    )
                    .setLabel(
                        "Jetzt abstimmen"
                    )
                    .setEmoji("🗳️")
                    .setStyle(
                        ButtonStyle.Success
                    ),

                createImposterGuessButton()
            );


    await sendChannelMessage(channel, {

        embeds: [

            new EmbedBuilder()
                .setTitle(
                    "🔄 RUNDE BEENDEN"
                )
                .setDescription(

                    "Alle Spieler haben ihren Hinweis gegeben.\n\n" +

                    "👑 **Nur der Leader entscheidet:**\n\n" +

                    "🔄 **Noch eine Runde**\n" +
                    "→ Noch einmal Hinweise geben – gleiches Wort und gleicher Imposter.\n\n" +

                    "🗳️ **Jetzt abstimmen**\n" +
                    "→ Die Abstimmung wird gestartet."
                )
        ],

        components: [row]
    });
}


// =====================================================
// GLEICHES WORT
// =====================================================

async function startNextRound(
    interaction
) {

    const game =
        games.get(
            interaction.guild.id
        );

    if (!game) {

        return interaction.reply({
            content:
                "❌ Das Spiel läuft nicht mehr.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        interaction.user.id !==
        game.leaderId
    ) {

        return interaction.reply({
            content:
                "❌ Nur der Leader kann eine weitere Runde starten.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        !game.waitingForRoundChoice
    ) {

        return interaction.reply({
            content:
                "❌ Das geht gerade nicht.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    game.waitingForRoundChoice =
        false;

    game.round++;

    game.currentSpeaker =
        0;

    game.finalGuessUsed =
        false;

    game.speakingOrder =
        [...game.players]
            .sort(
                () =>
                    Math.random() - 0.5
            );

    await interaction.update({

        content:
            `🔄 **Runde ${game.round} startet!**\n\n` +
            "Das Wort und der Imposter bleiben gleich.",

        embeds: [],

        components: []
    });

    await sendImposterGuessMessage(
        interaction.channel,
        game
    );

    await sendNextSpeaker(
        interaction.channel,
        game
    );
}


// =====================================================
// ABSTIMMUNG
// =====================================================

async function chooseVoting(
    interaction
) {

    const game =
        games.get(
            interaction.guild.id
        );

    if (!game) {

        return interaction.reply({
            content:
                "❌ Das Spiel läuft nicht mehr.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        interaction.user.id !==
        game.leaderId
    ) {

        return interaction.reply({
            content:
                "❌ Nur der Leader kann die Abstimmung starten.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        !game.waitingForRoundChoice
    ) {

        return interaction.reply({
            content:
                "❌ Die Abstimmung kann gerade nicht gestartet werden.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    game.waitingForRoundChoice =
        false;

    await interaction.update({

        content:
            "🗳️ **Die Abstimmung wurde gestartet.**",

        embeds: [],

        components: []
    });

    await startVoting(
        interaction.channel,
        game
    );
}


// =====================================================
// ABSTIMMUNG STARTEN
// =====================================================

async function startVoting(
    channel,
    game
) {

    game.voting =
        true;

    game.votes.clear();

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "imposter_vote"
            )
            .setPlaceholder(
                "Wähle den Imposter..."
            );


    for (
        const playerId of game.players
    ) {

        let username =
            "Unbekannter Spieler";

        try {

            username =
                (
                    await channel.client.users.fetch(
                        playerId
                    )
                ).username;

        } catch (error) {}


        menu.addOptions(

            new StringSelectMenuOptionBuilder()
                .setLabel(
                    username
                )
                .setValue(
                    playerId
                )
                .setDescription(
                    `Stimme für ${username}`
                )
        );
    }


    await sendChannelMessage(channel, {

        embeds: [

            new EmbedBuilder()
                .setTitle(
                    "🗳️ ABSTIMMUNG"
                )
                .setDescription(

                    "**Wer ist der Imposter?**\n\n" +

                    "Jeder Mitspieler muss genau einmal abstimmen.\n\n" +

                    "👥 **Alle müssen abstimmen.**"
                )
        ],

        components: [

            new ActionRowBuilder()
                .addComponents(
                    menu
                ),

            new ActionRowBuilder()
                .addComponents(
                    createImposterGuessButton()
                )
        ]
    });
}


// =====================================================
// ABSTIMMUNG VERARBEITEN
// =====================================================

async function handleVote(
    interaction
) {

    const game =
        games.get(
            interaction.guild.id
        );

    if (
        !game ||
        !game.voting
    ) {

        return interaction.reply({
            content:
                "❌ Die Abstimmung ist nicht aktiv.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        !game.players.includes(
            interaction.user.id
        )
    ) {

        return interaction.reply({
            content:
                "❌ Du bist kein Spieler.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    if (
        game.votes.has(
            interaction.user.id
        )
    ) {

        return interaction.reply({
            content:
                "❌ Du hast bereits abgestimmt.",
            flags:
                MessageFlags.Ephemeral
        });
    }

    game.votes.set(
        interaction.user.id,
        interaction.values[0]
    );

    await interaction.reply({

        content:
            "✅ Deine Stimme wurde gespeichert.",

        flags:
            MessageFlags.Ephemeral
    });


    if (
        game.votes.size ===
        game.players.length
    ) {

        await finishVoting(
            interaction.channel,
            game
        );
    }
}


// =====================================================
// ABSTIMMUNG AUSWERTEN
// =====================================================

async function finishVoting(
    channel,
    game
) {

    if (!game.voting) {
        return;
    }

    game.voting =
        false;

    const counts = {};

    for (
        const votedFor of
        game.votes.values()
    ) {

        counts[votedFor] =
            (counts[votedFor] || 0) + 1;
    }

    let highest = 0;

    let votedPlayer =
        null;

    for (
        const [playerId, count]
        of Object.entries(counts)
    ) {

        if (
            count > highest
        ) {

            highest =
                count;

            votedPlayer =
                playerId;
        }
    }

    if (!votedPlayer) {
        return;
    }

    let votedName =
        "Unbekannter Spieler";

    let imposterName =
        "Unbekannter Spieler";

    try {

        votedName =
            (
                await channel.client.users.fetch(
                    votedPlayer
                )
            ).username;

    } catch (error) {}

    try {

        imposterName =
            (
                await channel.client.users.fetch(
                    game.imposterId
                )
            ).username;

    } catch (error) {}


    // =================================================
    // IMPOSTER GEFUNDEN
    // =================================================

    if (
        votedPlayer ===
        game.imposterId
    ) {

        game.started =
            false;

        game.awaitingImposterGuess =
            true;

        game.waitingForNewGame =
            false;

        game.finalGuessUsed =
            false;

        const button =
            createImposterGuessButton();

        await sendChannelMessage(channel, {

            content:

                "🎉 **DER IMPOSTER WURDE GEFUNDEN!**\n\n" +

                `Die meisten Stimmen gingen an **${votedName}**.\n\n` +

                `🕵️ Der Imposter war **${imposterName}**.\n\n` +

                "🎯 **Der Imposter hat jetzt genau einen Versuch, " +
                "das Wort zu erraten.**\n\n" +

                "⏱️ **30 Sekunden**",

            components: [

                new ActionRowBuilder()
                    .addComponents(
                        button
                    )
            ]
        });


        if (game.finalGuessTimer) {
            clearTimeout(
                game.finalGuessTimer
            );
        }

        game.finalGuessTimer =
            setTimeout(
                async () => {

                    const currentGame =
                        games.get(
                            game.guildId
                        );

                    if (
                        !currentGame ||
                        !currentGame.awaitingImposterGuess
                    ) {
                        return;
                    }

                    currentGame.awaitingImposterGuess =
                        false;

                    currentGame.waitingForNewGame =
                        true;

                    currentGame.finalGuessTimer =
                        null;

                    await sendChannelMessage(channel, {

                        content:
                            "⏱️ **ZEIT ABGELAUFEN!**\n\n" +
                            "Der Imposter hat innerhalb von 30 Sekunden keinen Versuch abgegeben.\n\n" +
                            "🏆 **Die normalen Spieler gewinnen!**"
                    });

                    for (
                        const playerId of
                        currentGame.players
                    ) {

                        if (
                            playerId !==
                            currentGame.imposterId
                        ) {

                            addPoints(
                                currentGame.guildId,
                                playerId,
                                2
                            );
                        }
                    }

                    await sendNewRoundButton(
                        channel,
                        currentGame
                    );

                },
                FINAL_GUESS_TIME * 1000
            );

        return;
    }


    // =================================================
    // IMPOSTER NICHT GEFUNDEN
    // =================================================

    addPoints(
        game.guildId,
        game.imposterId,
        3
    );

    game.started =
        false;

    game.awaitingImposterGuess =
        false;

    game.waitingForNewGame =
        true;


    await sendChannelMessage(channel, {

        content:

            "😈 **DER IMPOSTER GEWINNT!**\n\n" +

            `Die meisten Stimmen gingen an **${votedName}**.\n\n` +

            `🕵️ Der echte Imposter war **${imposterName}**.\n\n` +

            "🏆 **Der Imposter bekommt +3 Punkte!**"
    });

    await sendNewRoundButton(
        channel,
        game
    );
}


// =====================================================
// BUTTONS
// =====================================================

async function handleButton(
    interaction
) {

    setupModalListener(
        interaction.client
    );

    const game =
        games.get(
            interaction.guild.id
        );


    if (
        interaction.customId ===
        "imposter_join"
    ) {

        if (!game) {

            return interaction.reply({
                content:
                    "❌ Es gibt keine aktive Lobby.",
                flags:
                    MessageFlags.Ephemeral
            });
        }

        if (game.started) {

            return interaction.reply({
                content:
                    "❌ Das Spiel wurde bereits gestartet.",
                flags:
                    MessageFlags.Ephemeral
            });
        }

        if (
            game.players.includes(
                interaction.user.id
            )
        ) {

            return interaction.reply({
                content:
                    "❌ Du bist bereits dabei.",
                flags:
                    MessageFlags.Ephemeral
            });
        }

        game.players.push(
            interaction.user.id
        );

        return updateLobby(
            interaction,
            game
        );
    }


    if (
        interaction.customId ===
        "imposter_leave"
    ) {

        if (!game) {

            return interaction.reply({
                content:
                    "❌ Es gibt keine aktive Lobby.",
                flags:
                    MessageFlags.Ephemeral
            });
        }

        if (game.started) {

            return interaction.reply({
                content:
                    "❌ Das Spiel wurde bereits gestartet.",
                flags:
                    MessageFlags.Ephemeral
            });
        }

        game.players =
            game.players.filter(
                id =>
                    id !==
                    interaction.user.id
            );

        return updateLobby(
            interaction,
            game
        );
    }


    if (
        interaction.customId ===
        "imposter_start"
    ) {

        return startGame(
            interaction
        );
    }


    if (
        interaction.customId ===
        "imposter_show_word"
    ) {

        return showSecretWord(
            interaction
        );
    }


    if (
        interaction.customId ===
        "imposter_guess_word"
    ) {

        return showGuessModal(
            interaction
        );
    }


    if (
        interaction.customId ===
        "imposter_next_speaker"
    ) {

        return nextSpeaker(
            interaction
        );
    }


    if (
        interaction.customId ===
        "imposter_next_round"
    ) {

        return startNextRound(
            interaction
        );
    }


    if (
        interaction.customId ===
        "imposter_start_voting"
    ) {

        return chooseVoting(
            interaction
        );
    }


    if (
        interaction.customId ===
        "imposter_stop_game"
    ) {

        return stopAfterResult(
            interaction
        );
    }


    if (
        interaction.customId ===
        "imposter_new_game"
    ) {

        return startCompletelyNewRound(
            interaction
        );
    }
}


// =====================================================
// SELECT MENU
// =====================================================

async function handleSelectMenu(
    interaction
) {

    if (
        interaction.customId ===
        "imposter_vote"
    ) {

        return handleVote(
            interaction
        );
    }
}


// =====================================================
// SPIEL STOPPEN
// =====================================================

async function stopGame(
    guildId,
    message,
    client
) {

    const game =
        games.get(
            guildId
        );

    if (!game) {
        return false;
    }

    clearGameTimer(game);

    if (game.finalGuessTimer) {

        clearTimeout(
            game.finalGuessTimer
        );

        game.finalGuessTimer = null;
    }

    games.delete(
        guildId
    );

    try {

        if (client) {

            const channel =
                await client.channels.fetch(
                    game.channelId
                );

            if (channel) {

                await channel.send(
                    message ||
                    "🛑 **Das Imposter-Spiel wurde beendet.**"
                );
            }
        }

    } catch (error) {

        console.error(
            "❌ Fehler beim Beenden:",
            error
        );
    }

    return true;
}


// =====================================================
// RANGLISTE
// =====================================================

async function getLeaderboard(
    interaction
) {

    const scores =
        loadScores();

    const guildScores =
        scores[
            interaction.guild.id
        ] || {};

    const ranking =
        Object.entries(
            guildScores
        )
            .sort(
                (a, b) =>
                    b[1] - a[1]
            );

    if (
        ranking.length === 0
    ) {

        return interaction.reply(
            "🏆 **IMPOSTER-PUNKTERANGLISTE**\n\n" +
            "Noch keine Punkte vorhanden."
        );
    }

    let text =
        "🏆 **IMPOSTER-PUNKTERANGLISTE**\n\n";

    for (
        let i = 0;
        i < ranking.length;
        i++
    ) {

        const userId =
            ranking[i][0];

        const points =
            ranking[i][1];

        let username =
            userId;

        try {

            username =
                (
                    await interaction.client.users.fetch(
                        userId
                    )
                ).username;

        } catch (error) {}

        const place =
            i === 0
                ? "🥇"
                : i === 1
                    ? "🥈"
                    : i === 2
                        ? "🥉"
                        : `${i + 1}.`;

        text +=
            `${place} **${username}** — ` +
            `**${points} Punkt${points === 1 ? "" : "e"}**\n`;
    }

    return interaction.reply(
        text
    );
}


// =====================================================
// RANGLISTE RESET
// =====================================================

async function resetLeaderboard(
    interaction
) {

    const scores =
        loadScores();

    scores[
        interaction.guild.id
    ] = {};

    saveScores(
        scores
    );

    return interaction.reply(
        "🔄 **Die Imposter-Punkterangliste wurde zurückgesetzt!**"
    );
}


// =====================================================
// EXPORT
// =====================================================

module.exports = {

    createLobby,

    stopGame,

    handleButton,

    handleSelectMenu,

    getLeaderboard,

    resetLeaderboard
};