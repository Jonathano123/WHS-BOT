const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
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

const imposterGame = require("./imposter/imposterGame");

// =====================================================
// BOT DATEN
// =====================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1489292835445407745";

const TEST_GUILD_IDS = [
    "1531355499134586970",
    "714579802790690937"
];

// =====================================================
// GESPERRTE BENUTZER
// =====================================================

const bannedUsers = [];

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});


// =====================================================
// DATEIEN
// =====================================================

const QUESTIONS_FILE = path.join(__dirname, "fragen.json");
const QUIZ_SCORES_FILE = path.join(__dirname, "scores.json");
const TABU_WORDS_FILE = path.join(__dirname, "tabuWords.json");
const TABU_SCORES_FILE = path.join(__dirname, "tabuScores.json");
const SLF_SCORES_FILE = path.join(__dirname, "stadtLandFlussScores.json");

// =====================================================
// HILFSFUNKTION JSON LADEN
// =====================================================

function loadJsonFile(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            console.error(`❌ Datei nicht gefunden: ${file}`);
            return fallback;
        }

        const raw = fs.readFileSync(file, "utf8").trim();

        if (!raw) {
            console.error(`❌ Datei ist leer: ${file}`);
            return fallback;
        }

        const data = JSON.parse(raw);

        console.log(`✅ Datei geladen: ${file}`);

        return data;
    } catch (error) {
        console.error(`❌ Fehler beim Laden von ${file}:`, error);
        return fallback;
    }
}

// =====================================================
// QUIZ FRAGEN
// =====================================================

let questions = loadJsonFile(
    QUESTIONS_FILE,
    []
);

if (!Array.isArray(questions)) {
    questions = [];
}

console.log(
    `❓ Quiz-Fragen geladen: ${questions.length}`
);

// =====================================================
// TABU WÖRTER
// =====================================================

let tabuWords = loadJsonFile(
    TABU_WORDS_FILE,
    []
);

if (!Array.isArray(tabuWords)) {
    console.error(
        "❌ tabuWords.json muss ein Array enthalten."
    );

    tabuWords = [];
}

tabuWords = tabuWords.filter(word => {
    return (
        word &&
        typeof word === "object" &&
        typeof word.word === "string" &&
        word.word.trim().length > 0 &&
        Array.isArray(word.taboo)
    );
});

console.log(
    `🚫 Tabu-Wörter geladen: ${tabuWords.length}`
);

if (tabuWords.length > 0) {
    console.log(
        `🚫 Erstes Tabu-Wort: ${tabuWords[0].word}`
    );
} else {
    console.error(
        "❌ Es wurden keine gültigen Tabu-Wörter gefunden!"
    );

    console.error(
        `📁 Erwarteter Pfad: ${TABU_WORDS_FILE}`
    );
}

// =====================================================
// QUIZ SERVER DATEN
// =====================================================

const serverData = new Map();

function getServerData(guildId) {
    if (!serverData.has(guildId)) {
        serverData.set(guildId, {
            quizRunning: false,
            currentQuestion: null,
            answersGiven: new Map(),
            quizMessage: null,
            quizTimer: null,
            questionStartTime: null,
            remainingQuestions: []
        });
    }

    return serverData.get(guildId);
}

// =====================================================
// QUIZ SCORES
// =====================================================

let allScores = loadJsonFile(
    QUIZ_SCORES_FILE,
    {}
);

if (
    !allScores ||
    typeof allScores !== "object" ||
    Array.isArray(allScores)
) {
    allScores = {};
}

function saveScores() {
    try {
        fs.writeFileSync(
            QUIZ_SCORES_FILE,
            JSON.stringify(allScores, null, 2),
            "utf8"
        );
    } catch (error) {
        console.error(
            "❌ Fehler beim Speichern der Quiz-Scores:",
            error
        );
    }
}

function getScores(guildId) {
    if (!allScores[guildId]) {
        allScores[guildId] = {};
    }

    return allScores[guildId];
}

function ensureUserScore(
    guildId,
    userId,
    username
) {
    const scores = getScores(guildId);

    if (!scores[userId]) {
        scores[userId] = {
            name: username,
            points: 0
        };
    }

    scores[userId].name = username;

    if (typeof scores[userId].points !== "number") {
        scores[userId].points = 0;
    }

    return scores[userId];
}

// =====================================================
// TABU SCORES
// =====================================================

let tabuScores = loadJsonFile(
    TABU_SCORES_FILE,
    {}
);

if (
    !tabuScores ||
    typeof tabuScores !== "object" ||
    Array.isArray(tabuScores)
) {
    tabuScores = {};
}

function saveTabuScores() {
    try {
        fs.writeFileSync(
            TABU_SCORES_FILE,
            JSON.stringify(tabuScores, null, 2),
            "utf8"
        );
    } catch (error) {
        console.error(
            "❌ Fehler beim Speichern der Tabu-Scores:",
            error
        );
    }
}

function getTabuScores(guildId) {
    if (!tabuScores[guildId]) {
        tabuScores[guildId] = {};
    }

    return tabuScores[guildId];
}

function ensureTabuUser(
    guildId,
    userId,
    username
) {
    const scores = getTabuScores(guildId);

    if (!scores[userId]) {
        scores[userId] = {
            name: username,
            points: 0,
            correct: 0,
            rounds: 0
        };
    }

    scores[userId].name = username;

    if (typeof scores[userId].points !== "number") {
        scores[userId].points = 0;
    }

    if (typeof scores[userId].correct !== "number") {
        scores[userId].correct = 0;
    }

    if (typeof scores[userId].rounds !== "number") {
        scores[userId].rounds = 0;
    }

    return scores[userId];
}

// =====================================================
// TABU SPIEL DATEN
// =====================================================

const tabuGames = new Map();

function getTabuGame(guildId) {
    if (!tabuGames.has(guildId)) {
        tabuGames.set(guildId, {
            running: false,
            channelId: null,

            players: [],

            currentExplainer: null,

            currentWord: null,
            currentTaboo: [],

            usedWords: [],

            round: 0,
            score: 0,
            guessed: 0,
            skipped: 0,

            timer: null,
            nextRoundTimer: null,

            roundActive: false,

            explainerIndex: 0
        });
    }

    return tabuGames.get(guildId);
}

// =====================================================
// STADT, LAND, FLUSS – SCORES
// =====================================================

let slfScores = loadJsonFile(
    SLF_SCORES_FILE,
    {}
);

if (
    !slfScores ||
    typeof slfScores !== "object" ||
    Array.isArray(slfScores)
) {
    slfScores = {};
}

function saveSlfScores() {
    try {
        fs.writeFileSync(
            SLF_SCORES_FILE,
            JSON.stringify(slfScores, null, 2),
            "utf8"
        );
    } catch (error) {
        console.error(
            "❌ Fehler beim Speichern der Stadt-Land-Fluss-Scores:",
            error
        );
    }
}

function getSlfScores(guildId) {
    if (!slfScores[guildId]) {
        slfScores[guildId] = {};
    }

    return slfScores[guildId];
}

function ensureSlfUser(guildId, userId, username) {
    const scores = getSlfScores(guildId);

    if (!scores[userId]) {
        scores[userId] = {
            name: username,
            points: 0,
            rounds: 0
        };
    }

    scores[userId].name = username;

    if (typeof scores[userId].points !== "number") {
        scores[userId].points = 0;
    }

    if (typeof scores[userId].rounds !== "number") {
        scores[userId].rounds = 0;
    }

    return scores[userId];
}

// =====================================================
// STADT, LAND, FLUSS – SPIELDATEN
// =====================================================

const slfGames = new Map();

function getSlfGame(guildId) {
    if (!slfGames.has(guildId)) {
        slfGames.set(guildId, {
            running: false,
            roundActive: false,
            channelId: null,
            letter: null,
            round: 0,
            timer: null,
            roundEndTimer: null,
            answers: new Map(),
            pendingAnswers: new Map()
        });
    }

    return slfGames.get(guildId);
}

const SLF_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function getRandomSlfLetter() {
    return SLF_LETTERS[
        Math.floor(Math.random() * SLF_LETTERS.length)
    ];
}

function normalizeSlfAnswer(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ß/g, "ss")
        .trim();
}

function isValidSlfAnswer(answer, letter) {
    const normalized = normalizeSlfAnswer(answer);

    if (!normalized || !letter) {
        return false;
    }

    return normalized.startsWith(letter.toLowerCase());
}

// =====================================================
// STADT, LAND, FLUSS – RUNDE
// =====================================================

async function startSlfRound(channel) {
    const game = getSlfGame(channel.guild.id);

    if (!game.running || game.roundActive) {
        return;
    }

    game.round++;
    game.letter = getRandomSlfLetter();
    game.roundActive = true;
    game.answers.clear();
    game.pendingAnswers.clear();

    const embed = new EmbedBuilder()
        .setTitle(`🌍 STADT, LAND, FLUSS – Runde ${game.round}`)
        .setDescription(
            `🔤 **Buchstabe: ${game.letter}**\n\n` +
            "🏙️ **Stadt**\n" +
            "🌎 **Land**\n" +
            "🌊 **Fluss**\n" +
            "🐾 **Tier**\n" +
            "💼 **Beruf**\n" +
            "👤 **Vorname**\n\n" +
            "Klicke auf **Antworten**, um deine sechs Begriffe einzugeben.\n\n" +
            "⏱️ **60 Sekunden Zeit**"
        )
        .setFooter({
            text: "Die Antworten müssen mit dem vorgegebenen Buchstaben beginnen."
        });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("slf_answer")
                .setLabel("Antworten")
                .setEmoji("📝")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("slf_stop")
                .setLabel("Stop")
                .setEmoji("🛑")
                .setStyle(ButtonStyle.Danger)
        );

    await channel.send({
        embeds: [embed],
        components: [row]
    });

    clearTimeout(game.timer);

    game.timer = setTimeout(() => {
        endSlfRound(channel).catch(console.error);
    }, 60000);
}

async function startSlf(interaction) {
    const game = getSlfGame(interaction.guild.id);

    if (game.running) {
        return interaction.reply({
            content: "❌ Stadt, Land, Fluss läuft bereits.",
            flags: MessageFlags.Ephemeral
        });
    }

    game.running = true;
    game.roundActive = false;
    game.channelId = interaction.channel.id;
    game.round = 0;
    game.letter = null;
    game.answers.clear();
    game.pendingAnswers.clear();

    await interaction.reply("🌍 **Stadt, Land, Fluss gestartet!**");

    return startSlfRound(interaction.channel);
}

async function showSlfAnswerModal(interaction) {
    const game = getSlfGame(interaction.guild.id);

    if (!game.running || !game.roundActive) {
        return interaction.reply({
            content: "❌ Momentan läuft keine aktive Stadt-Land-Fluss-Runde.",
            flags: MessageFlags.Ephemeral
        });
    }

    const makeInput = (id, label, placeholder) =>
        new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setPlaceholder(placeholder)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

    const modal = new ModalBuilder()
        .setCustomId("slf_answer_modal")
        .setTitle(`🌍 Antworten – ${game.letter}`);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            makeInput("stadt", "🏙️ Stadt", `Stadt mit ${game.letter}...`)
        ),
        new ActionRowBuilder().addComponents(
            makeInput("land", "🌎 Land", `Land mit ${game.letter}...`)
        ),
        new ActionRowBuilder().addComponents(
            makeInput("fluss", "🌊 Fluss", `Fluss mit ${game.letter}...`)
        ),
        new ActionRowBuilder().addComponents(
            makeInput("tier", "🐾 Tier", `Tier mit ${game.letter}...`)
        ),
        new ActionRowBuilder().addComponents(
            makeInput("beruf", "💼 Beruf", `Beruf mit ${game.letter}...`)
        )
    );

    return interaction.showModal(modal);
}

async function handleSlfAnswerModal(interaction) {
    const game = getSlfGame(interaction.guild.id);

    if (!game.running || !game.roundActive) {
        return interaction.reply({
            content: "❌ Die Runde ist nicht mehr aktiv.",
            flags: MessageFlags.Ephemeral
        });
    }

    const userId = interaction.user.id;

    if (game.answers.has(userId) || game.pendingAnswers.has(userId)) {
        return interaction.reply({
            content: "⚠️ Du hast diese Runde bereits abgegeben.",
            flags: MessageFlags.Ephemeral
        });
    }

    const answers = {
        stadt: interaction.fields.getTextInputValue("stadt").trim(),
        land: interaction.fields.getTextInputValue("land").trim(),
        fluss: interaction.fields.getTextInputValue("fluss").trim(),
        tier: interaction.fields.getTextInputValue("tier").trim(),
        beruf: interaction.fields.getTextInputValue("beruf").trim()
    };

    game.pendingAnswers.set(userId, {
        username: interaction.user.username,
        answers
    });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("slf_vorname")
                .setLabel("Vorname eingeben")
                .setEmoji("👤")
                .setStyle(ButtonStyle.Primary)
        );

    return interaction.reply({
        content:
            "✅ Die ersten 5 Antworten wurden gespeichert.\n\n" +
            "👤 Jetzt fehlt nur noch dein **Vorname**.",
        components: [row],
        flags: MessageFlags.Ephemeral
    });
}

async function showSlfVornameModal(interaction) {
    const game = getSlfGame(interaction.guild.id);

    if (!game.running || !game.roundActive) {
        return interaction.reply({
            content: "❌ Die Runde ist nicht mehr aktiv.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!game.pendingAnswers.has(interaction.user.id)) {
        return interaction.reply({
            content: "❌ Bitte fülle zuerst die ersten fünf Felder aus.",
            flags: MessageFlags.Ephemeral
        });
    }

    const modal = new ModalBuilder()
        .setCustomId("slf_vorname_modal")
        .setTitle(`👤 Vorname – ${game.letter}`);

    const input = new TextInputBuilder()
        .setCustomId("vorname")
        .setLabel("👤 Vorname")
        .setPlaceholder(`Vorname mit ${game.letter}...`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    return interaction.showModal(modal);
}

async function finishSlfAnswer(interaction, vorname) {
    const game = getSlfGame(interaction.guild.id);
    const userId = interaction.user.id;
    const pending = game.pendingAnswers.get(userId);

    if (!pending) {
        return interaction.reply({
            content: "❌ Keine offene Antwort gefunden.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!game.running || !game.roundActive) {
        game.pendingAnswers.delete(userId);

        return interaction.reply({
            content: "❌ Die Runde ist nicht mehr aktiv.",
            flags: MessageFlags.Ephemeral
        });
    }

    const answers = {
        ...pending.answers,
        vorname: String(vorname || "").trim()
    };

    const validFields = Object.entries(answers)
        .filter(([, answer]) => isValidSlfAnswer(answer, game.letter))
        .map(([field]) => field);

    const invalidFields = Object.entries(answers)
        .filter(([, answer]) => !isValidSlfAnswer(answer, game.letter))
        .map(([field]) => field);

    game.pendingAnswers.delete(userId);
    game.answers.set(userId, {
        username: interaction.user.username,
        answers,
        validFields
    });

    const score = ensureSlfUser(
        interaction.guild.id,
        userId,
        interaction.user.username
    );

    score.points += validFields.length;
    score.rounds += 1;

    saveSlfScores();

    const fieldNames = {
        stadt: "Stadt",
        land: "Land",
        fluss: "Fluss",
        tier: "Tier",
        beruf: "Beruf",
        vorname: "Vorname"
    };

    const validText = validFields.length
        ? validFields.map(field => `✅ ${fieldNames[field]}`).join("\n")
        : "Keine gültige Antwort.";

    const invalidText = invalidFields.length
        ? "\n\n" + invalidFields
            .map(field => `❌ ${fieldNames[field]} – beginnt nicht mit ${game.letter}`)
            .join("\n")
        : "";

    return interaction.reply({
        content:
            `📝 **Antworten gespeichert!**\n\n` +
            `${validText}${invalidText}\n\n` +
            `🏆 **+${validFields.length} Punkte**`,
        flags: MessageFlags.Ephemeral
    });
}

async function handleSlfVornameModal(interaction) {
    const game = getSlfGame(interaction.guild.id);

    if (!game.running || !game.roundActive) {
        return interaction.reply({
            content: "❌ Die Runde ist nicht mehr aktiv.",
            flags: MessageFlags.Ephemeral
        });
    }

    const vorname = interaction.fields
        .getTextInputValue("vorname")
        .trim();

    return finishSlfAnswer(interaction, vorname);
}

async function endSlfRound(channel) {
    const game = getSlfGame(channel.guild.id);

    if (!game.roundActive) {
        return;
    }

    clearTimeout(game.timer);
    game.timer = null;
    game.roundActive = false;

    const answerCount = game.answers.size;

    await channel.send(
        `⏱️ **Zeit vorbei!**\n\n` +
        `🔤 Buchstabe war **${game.letter}**.\n` +
        `👥 **${answerCount} Spieler** haben ihre Antworten abgegeben.\n\n` +
        `➡️ Die nächste Runde startet in **5 Sekunden**.`
    );

    game.roundEndTimer = setTimeout(() => {
        if (game.running) {
            startSlfRound(channel).catch(console.error);
        }
    }, 5000);
}

async function stopSlf(interaction) {
    const game = getSlfGame(interaction.guild.id);

    if (!game.running) {
        return interaction.reply({
            content: "❌ Stadt, Land, Fluss läuft momentan nicht.",
            flags: MessageFlags.Ephemeral
        });
    }

    game.running = false;
    game.roundActive = false;

    clearTimeout(game.timer);
    clearTimeout(game.roundEndTimer);

    game.timer = null;
    game.roundEndTimer = null;
    game.letter = null;
    game.answers.clear();
    game.pendingAnswers.clear();

    return interaction.reply("🛑 **Stadt, Land, Fluss wurde beendet.**");
}

async function slfRank(interaction) {
    const scores = getSlfScores(interaction.guild.id);

    const ranking = Object.values(scores).sort(
        (a, b) => b.points - a.points
    );

    if (!ranking.length) {
        return interaction.reply(
            "🏆 **Stadt, Land, Fluss – Rangliste**\n\nNoch keine Punkte."
        );
    }

    let text = "🏆 **STADT, LAND, FLUSS – RANGLISTE**\n\n";

    ranking.forEach((user, index) => {
        const place =
            index === 0 ? "🥇" :
            index === 1 ? "🥈" :
            index === 2 ? "🥉" :
            `${index + 1}.`;

        text +=
            `${place} **${user.name}** — **${user.points} Punkte** ` +
            `(${user.rounds} Runden)\n`;
    });

    return interaction.reply(text);
}

async function resetSlfRank(interaction) {
    if (
        !interaction.member.permissions.has("Administrator")
    ) {
        return interaction.reply({
            content: "❌ Dafür brauchst du Administrator-Rechte.",
            flags: MessageFlags.Ephemeral
        });
    }

    slfScores[interaction.guild.id] = {};
    saveSlfScores();

    return interaction.reply(
        "🔄 **Stadt-Land-Fluss-Rangliste zurückgesetzt!**"
    );
}

async function handleSlfButton(interaction) {
    if (interaction.customId === "slf_answer") {
        return showSlfAnswerModal(interaction);
    }

    if (interaction.customId === "slf_stop") {
        return stopSlf(interaction);
    }
}

// =====================================================
// GAMES MENÜ
// =====================================================

async function showGamesMenu(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("🎮 Gruppen-Spiele")
        .setDescription(
            "Wähle ein Spiel aus!\n\n" +
            "🕵️ **Imposter**\n" +
            "Ein Spieler ist der Imposter und muss das geheime Wort erraten.\n\n" +
            "❓ **Quiz**\n" +
            "Beantworte Fragen so schnell wie möglich.\n\n" +
            "🚫 **Tabu**\n" +
            "Erkläre ein Wort, ohne die verbotenen Wörter zu benutzen.\n\n" +
            "🌍 **Stadt, Land, Fluss**\n" +
            "Finde Stadt, Land, Fluss, Tier, Beruf und Vorname mit dem richtigen Buchstaben."
        );

    const menu = new StringSelectMenuBuilder()
        .setCustomId("games_select")
        .setPlaceholder("🎮 Spiel auswählen...")
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("Imposter")
                .setDescription("Das Imposter-Spiel öffnen")
                .setEmoji("🕵️")
                .setValue("imposter"),

            new StringSelectMenuOptionBuilder()
                .setLabel("Quiz")
                .setDescription("Das Quiz öffnen")
                .setEmoji("❓")
                .setValue("quiz"),

            new StringSelectMenuOptionBuilder()
                .setLabel("Tabu")
                .setDescription("Das Tabu-Spiel öffnen")
                .setEmoji("🚫")
                .setValue("tabu"),

            new StringSelectMenuOptionBuilder()
                .setLabel("Stadt, Land, Fluss")
                .setDescription("Stadt, Land, Fluss, Tier, Beruf und Vorname")
                .setEmoji("🌍")
                .setValue("stadtlandfluss"),

        );

    const row = new ActionRowBuilder()
        .addComponents(menu);

    return interaction.reply({
        embeds: [embed],
        components: [row]
    });
}

// =====================================================
// SPIEL AKTIONEN
// =====================================================

async function showGameActions(
    interaction,
    game
) {
    const names = {
        imposter: "🕵️ Imposter",
        quiz: "❓ Quiz",
        tabu: "🚫 Tabu",
        stadtlandfluss: "🌍 Stadt, Land, Fluss"
    };

    const embed = new EmbedBuilder()
        .setTitle(`${names[game]} – Steuerung`)
        .setDescription(
            "▶️ **Play** – Spiel starten\n\n" +
            "🛑 **Stop** – Spiel beenden\n\n" +
            "🏆 **Rank** – Rangliste anzeigen\n\n" +
            "🔄 **Reset** – Punkte zurücksetzen"
        );

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`games_play_${game}`)
                .setLabel("Play")
                .setEmoji("▶️")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(`games_stop_${game}`)
                .setLabel("Stop")
                .setEmoji("🛑")
                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
                .setCustomId(`games_rank_${game}`)
                .setLabel("Rank")
                .setEmoji("🏆")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(`games_reset_${game}`)
                .setLabel("Reset")
                .setEmoji("🔄")
                .setStyle(ButtonStyle.Secondary)
        );

    return interaction.update({
        embeds: [embed],
        components: [row]
    });
}

// =====================================================
// QUIZ
// =====================================================

async function startQuestion(channel) {
    const data = getServerData(channel.guild.id);

    if (!data.quizRunning) {
        return;
    }

    if (data.remainingQuestions.length === 0) {
        data.quizRunning = false;

        clearTimeout(data.quizTimer);
        data.quizTimer = null;

        return showFinalRanking(channel);
    }

    const randomIndex = Math.floor(
        Math.random() * data.remainingQuestions.length
    );

    data.currentQuestion =
        data.remainingQuestions.splice(
            randomIndex,
            1
        )[0];

    data.answersGiven.clear();
    data.questionStartTime = Date.now();

    const q = data.currentQuestion;

    const embed = new EmbedBuilder()
        .setTitle("❓ Quizfrage")
        .setDescription(
            `**${q.question}**\n\n` +
            `🇦 ${q.answers[0]}\n\n` +
            `🇧 ${q.answers[1]}\n\n` +
            `🇨 ${q.answers[2]}\n\n` +
            `🇩 ${q.answers[3]}`
        )
        .setFooter({
            text: "⏱️ 30 Sekunden Zeit"
        });

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("answer_0")
                .setLabel("🇦")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId("answer_1")
                .setLabel("🇧")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId("answer_2")
                .setLabel("🇨")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId("answer_3")
                .setLabel("🇩")
                .setStyle(ButtonStyle.Primary)
        );

    data.quizMessage = await channel.send({
        embeds: [embed],
        components: [buttons]
    });

    clearTimeout(data.quizTimer);

    data.quizTimer = setTimeout(() => {
        endQuestion(channel).catch(console.error);
    }, 30000);
}

async function handleQuizAnswer(interaction) {
    const data = getServerData(interaction.guild.id);

    await interaction.deferReply({
        flags: MessageFlags.Ephemeral
    });

    if (!data.quizRunning) {
        return interaction.editReply(
            "❌ Das Quiz läuft momentan nicht."
        );
    }

    if (!data.currentQuestion) {
        return interaction.editReply(
            "❌ Momentan ist keine Frage aktiv."
        );
    }

    const match = interaction.customId.match(
        /^answer_(\d)$/
    );

    if (!match) {
        return interaction.editReply(
            "❌ Ungültige Antwort."
        );
    }

    const answerIndex = Number(match[1]);

    if (data.answersGiven.has(interaction.user.id)) {
        return interaction.editReply(
            "⚠️ Du hast diese Frage bereits beantwortet."
        );
    }

    data.answersGiven.set(
        interaction.user.id,
        answerIndex
    );

    const correct =
        answerIndex === data.currentQuestion.correct;

    const score = ensureUserScore(
        interaction.guild.id,
        interaction.user.id,
        interaction.user.username
    );

    if (correct) {
        score.points += 1;
        saveScores();

        return interaction.editReply(
            "✅ **Richtig! +1 Punkt** 🎉"
        );
    }

    saveScores();

    return interaction.editReply(
        `❌ **Falsch!**\nDie richtige Antwort ist **${
            data.currentQuestion.answers[
                data.currentQuestion.correct
            ]
        }**.`
    );
}

async function endQuestion(channel) {
    const data = getServerData(channel.guild.id);

    clearTimeout(data.quizTimer);
    data.quizTimer = null;

    if (!data.quizRunning || !data.currentQuestion) {
        return;
    }

    if (data.quizMessage) {
        try {
            const disabledButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("answer_0")
                        .setLabel("🇦")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),

                    new ButtonBuilder()
                        .setCustomId("answer_1")
                        .setLabel("🇧")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),

                    new ButtonBuilder()
                        .setCustomId("answer_2")
                        .setLabel("🇨")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),

                    new ButtonBuilder()
                        .setCustomId("answer_3")
                        .setLabel("🇩")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );

            await data.quizMessage.edit({
                components: [disabledButtons]
            });
        } catch (error) {
            console.error(
                "❌ Quiz-Buttons konnten nicht deaktiviert werden:",
                error
            );
        }
    }

    await channel.send(
        `⏱️ **Zeit vorbei!**\n\n` +
        `Die richtige Antwort war **${
            data.currentQuestion.answers[
                data.currentQuestion.correct
            ]
        }**.\n\n` +
        `➡️ Nächste Frage kommt in **5 Sekunden**...`
    );

    data.currentQuestion = null;

    setTimeout(() => {
        if (data.quizRunning) {
            startQuestion(channel).catch(console.error);
        }
    }, 5000);
}

async function showFinalRanking(channel) {
    const scores = getScores(channel.guild.id);

    const ranking = Object.values(scores).sort(
        (a, b) => b.points - a.points
    );

    if (!ranking.length) {
        return channel.send(
            "🏁 **Quiz beendet!**\n\n🏆 Noch keine Punkte."
        );
    }

    let text =
        "🏁 **QUIZ BEENDET!**\n\n🏆 **ENDRANGLISTE** 🏆\n\n";

    ranking.forEach((user, index) => {
        const place =
            index === 0 ? "🥇" :
            index === 1 ? "🥈" :
            index === 2 ? "🥉" :
            `${index + 1}.`;

        text +=
            `${place} **${user.name}** — ${user.points} Punkte\n`;
    });

    return channel.send(text);
}

async function startQuiz(interaction) {
    const data = getServerData(interaction.guild.id);

    if (data.quizRunning) {
        return interaction.reply({
            content: "❌ Das Quiz läuft bereits.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!questions.length) {
        return interaction.reply({
            content: "❌ Keine Fragen vorhanden.",
            flags: MessageFlags.Ephemeral
        });
    }

    data.quizRunning = true;
    data.remainingQuestions = [...questions];
    data.answersGiven.clear();

    await interaction.reply("🎮 **Quiz gestartet!**");

    return startQuestion(interaction.channel);
}

async function stopQuiz(interaction) {
    const data = getServerData(interaction.guild.id);

    if (!data.quizRunning) {
        return interaction.reply({
            content: "❌ Das Quiz läuft momentan nicht.",
            flags: MessageFlags.Ephemeral
        });
    }

    data.quizRunning = false;

    clearTimeout(data.quizTimer);
    data.quizTimer = null;

    data.currentQuestion = null;
    data.remainingQuestions = [];

    return interaction.reply(
        "🛑 **Quiz gestoppt.**"
    );
}

async function quizRank(interaction) {
    const scores = getScores(interaction.guild.id);

    const ranking = Object.values(scores).sort(
        (a, b) => b.points - a.points
    );

    if (!ranking.length) {
        return interaction.reply(
            "🏆 Noch keine Quiz-Punkte."
        );
    }

    let text = "🏆 **QUIZ-RANGLISTE**\n\n";

    ranking.forEach((user, index) => {
        const place =
            index === 0 ? "🥇" :
            index === 1 ? "🥈" :
            index === 2 ? "🥉" :
            `${index + 1}.`;

        text +=
            `${place} **${user.name}** — ${user.points} Punkte\n`;
    });

    return interaction.reply(text);
}

async function resetQuizRank(interaction) {
    if (
        !interaction.member.permissions.has("Administrator")
    ) {
        return interaction.reply({
            content:
                "❌ Dafür brauchst du Administrator-Rechte.",
            flags: MessageFlags.Ephemeral
        });
    }

    allScores[interaction.guild.id] = {};
    saveScores();

    return interaction.reply(
        "🔄 **Quiz-Rangliste zurückgesetzt!**"
    );
}

// =====================================================
// TABU – WORT AUSWÄHLEN
// =====================================================

function getRandomTabuWord(game) {
    if (!tabuWords.length) {
        return null;
    }

    let available = tabuWords.filter(
        (_, index) =>
            !game.usedWords.includes(index)
    );

    if (!available.length) {
        game.usedWords = [];

        available = [...tabuWords];
    }

    const selected =
        available[
            Math.floor(
                Math.random() * available.length
            )
        ];

    const index = tabuWords.indexOf(selected);

    game.usedWords.push(index);

    return selected;
}

// =====================================================
// TABU – SPIELERLISTE
// =====================================================

async function createTabuLobbyMessage(channel) {
    const game = getTabuGame(channel.guild.id);

    let playerText = "";

    if (!game.players.length) {
        playerText = "Noch niemand beigetreten.";
    } else {
        playerText = game.players
            .map(
                (id, index) =>
                    `${index + 1}. <@${id}>`
            )
            .join("\n");
    }

    const embed = new EmbedBuilder()
        .setTitle("🚫 TABU – Lobby")
        .setDescription(
            "👥 **Spieler**\n\n" +
            playerText +
            "\n\n" +
            `👥 **${game.players.length} Spieler**\n\n` +
            "Mindestens **2 Spieler** werden benötigt.\n\n" +
            "Wenn alle dabei sind, kann ein Spieler auf **Runde starten** klicken."
        );

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("tabu_join")
                .setLabel("Mitspielen")
                .setEmoji("👥")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId("tabu_begin")
                .setLabel("Runde starten")
                .setEmoji("▶️")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId("tabu_stop")
                .setLabel("Stop")
                .setEmoji("🛑")
                .setStyle(ButtonStyle.Danger)
        );

    return channel.send({
        embeds: [embed],
        components: [buttons]
    });
}

// =====================================================
// TABU START
// =====================================================

async function startTabu(interaction) {
    const guildId = interaction.guild.id;
    const game = getTabuGame(guildId);

    if (game.running) {
        return interaction.reply({
            content: "❌ Tabu läuft bereits.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!tabuWords.length) {
        return interaction.reply({
            content:
                "❌ Es wurden keine Tabu-Wörter geladen.\n" +
                `📁 Gesucht wird: \`${TABU_WORDS_FILE}\``,
            flags: MessageFlags.Ephemeral
        });
    }

    game.running = true;
    game.channelId = interaction.channel.id;

    game.round = 0;
    game.score = 0;
    game.guessed = 0;
    game.skipped = 0;

    game.usedWords = [];

    game.players = [];

    game.currentWord = null;
    game.currentTaboo = [];
    game.currentExplainer = null;

    game.roundActive = false;
    game.explainerIndex = 0;

    await interaction.reply({
        content:
            "🚫 **TABU GESTARTET!**\n\n" +
            "👥 Die Lobby wurde erstellt.\n" +
            "Klickt auf **Mitspielen**, um teilzunehmen.",
        flags: MessageFlags.Ephemeral
    });

    return createTabuLobbyMessage(
        interaction.channel
    );
}

// =====================================================
// TABU – PRIVATE WORTANZEIGE
// =====================================================

async function showPrivateTabuWord(interaction) {
    const game = getTabuGame(
        interaction.guild.id
    );

    if (!game.running || !game.roundActive) {
        return interaction.reply({
            content:
                "❌ Momentan läuft keine aktive Tabu-Runde.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (
        interaction.user.id !==
        game.currentExplainer
    ) {
        return interaction.reply({
            content:
                "❌ Nur der aktuelle Erklärer kann das geheime Wort sehen.",
            flags: MessageFlags.Ephemeral
        });
    }

    const secretEmbed = new EmbedBuilder()
        .setTitle("🔐 DEIN GEHEIMES TABU-WORT")
        .setDescription(
            `# ${game.currentWord}\n\n` +
            "🚫 **TABU-WÖRTER:**\n" +
            game.currentTaboo
                .map(word => `• ${word}`)
                .join("\n") +
            "\n\n" +
            "⚠️ Niemand außer dir kann diese Nachricht sehen.\n" +
            "Du darfst das Hauptwort und die Tabu-Wörter nicht benutzen."
        );

    return interaction.reply({
        embeds: [secretEmbed],
        flags: MessageFlags.Ephemeral
    });
}

// =====================================================
// TABU RUNDE STARTEN
// =====================================================

async function startTabuRound(channel) {
    const game = getTabuGame(channel.guild.id);

    if (!game.running) {
        return;
    }

    if (game.roundActive) {
        return;
    }

    if (game.players.length < 2) {
        return channel.send(
            "❌ Für Tabu werden mindestens **2 Spieler** benötigt."
        );
    }

    const word = getRandomTabuWord(game);

    if (!word) {
        return channel.send(
            "❌ Kein Tabu-Wort verfügbar."
        );
    }

    game.round++;

    game.currentWord = word.word;

    game.currentTaboo =
        Array.isArray(word.taboo)
            ? word.taboo
            : [];

    // =================================================
    // ERKLÄRER WECHSELN
    // =================================================

    game.currentExplainer =
        game.players[
            game.explainerIndex %
            game.players.length
        ];

    game.explainerIndex++;

    game.roundActive = true;

    const explainer =
        await client.users.fetch(
            game.currentExplainer
        );

    // =================================================
    // WICHTIG:
    // HIER WIRD DAS HAUPTWORT NICHT GESENDET!
    // =================================================

    const publicEmbed = new EmbedBuilder()
        .setTitle(
            `🚫 TABU – Runde ${game.round}`
        )
        .setDescription(
            `🎤 **Erklärer:** ${explainer.username}\n\n` +
            "🔐 Das geheime Wort ist nur für den Erklärer sichtbar.\n\n" +
            "Der Erklärer kann unten auf **Geheimes Wort anzeigen** klicken.\n\n" +
            "🎯 Die anderen Spieler müssen das Wort erraten.\n\n" +
            "⏱️ **60 Sekunden**"
        );

    const controls = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("tabu_show_word")
                .setLabel("Geheimes Wort anzeigen")
                .setEmoji("🔐")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId("tabu_correct")
                .setLabel("Wort erraten")
                .setEmoji("🎯")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId("tabu_skip")
                .setLabel("Überspringen")
                .setEmoji("⏭️")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId("tabu_stop")
                .setLabel("Stop")
                .setEmoji("🛑")
                .setStyle(ButtonStyle.Danger)
        );

    await channel.send({
        embeds: [publicEmbed],
        components: [controls]
    });

    // =================================================
    // TIMER
    // =================================================

    game.timer = setTimeout(() => {
        endTabuRound(channel).catch(console.error);
    }, 60000);
}

// =====================================================
// TABU – RATE-MODAL ÖFFNEN
// =====================================================

async function showTabuGuessModal(interaction) {
    const game = getTabuGame(
        interaction.guild.id
    );

    if (!game.running || !game.roundActive) {
        return interaction.reply({
            content:
                "❌ Momentan läuft keine aktive Tabu-Runde.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (
        interaction.user.id ===
        game.currentExplainer
    ) {
        return interaction.reply({
            content:
                "❌ Der Erklärer darf nicht selbst raten.",
            flags: MessageFlags.Ephemeral
        });
    }

    const modal = new ModalBuilder()
        .setCustomId("tabu_guess_modal")
        .setTitle("🎯 Tabu-Wort erraten");

    const input = new TextInputBuilder()
        .setCustomId("tabu_guess_input")
        .setLabel("Welches Wort wurde erklärt?")
        .setPlaceholder("Gib deine Vermutung ein...")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

    const row = new ActionRowBuilder()
        .addComponents(input);

    modal.addComponents(row);

    return interaction.showModal(modal);
}

// =====================================================
// TABU – GUESS AUSWERTEN
// =====================================================

async function handleTabuGuessModal(interaction) {
    const game = getTabuGame(
        interaction.guild.id
    );

    if (!game.running || !game.roundActive) {
        return interaction.reply({
            content:
                "❌ Die Runde ist nicht mehr aktiv.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (
        interaction.user.id ===
        game.currentExplainer
    ) {
        return interaction.reply({
            content:
                "❌ Der Erklärer darf nicht selbst raten.",
            flags: MessageFlags.Ephemeral
        });
    }

    const guess =
        interaction.fields
            .getTextInputValue(
                "tabu_guess_input"
            )
            .trim();

    if (!guess) {
        return interaction.reply({
            content:
                "❌ Bitte gib ein Wort ein.",
            flags: MessageFlags.Ephemeral
        });
    }

    const correctWord =
        game.currentWord.trim();

    const normalize = text =>
        text
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/ß/g, "ss")
            .trim();

    const isCorrect =
        normalize(guess) ===
        normalize(correctWord);

    if (!isCorrect) {
        return interaction.reply({
            content:
                "❌ **Falsch!** Versuch es nochmal.",
            flags: MessageFlags.Ephemeral
        });
    }

    // =================================================
    // RICHTIG
    // =================================================

    clearTimeout(game.timer);
    game.timer = null;

    game.roundActive = false;
    game.guessed++;

    const score = ensureTabuUser(
        interaction.guild.id,
        interaction.user.id,
        interaction.user.username
    );

    score.points += 1;
    score.correct += 1;
    score.rounds += 1;

    saveTabuScores();

    await interaction.reply({
        content:
            "✅ **Richtig! +1 Punkt** 🎉",
        flags: MessageFlags.Ephemeral
    });

    await interaction.channel.send(
        `🎉 **${interaction.user.username}** hat das Wort erraten!`
    );

    // WICHTIG:
    // Das Wort wird NICHT öffentlich angezeigt.

    game.nextRoundTimer = setTimeout(() => {
        if (game.running) {
            startTabuRound(
                interaction.channel
            ).catch(console.error);
        }
    }, 3000);
}

// =====================================================
// TABU RUNDE ENDE
// =====================================================

async function endTabuRound(channel) {
    const game = getTabuGame(channel.guild.id);

    if (!game.roundActive) {
        return;
    }

    clearTimeout(game.timer);
    game.timer = null;

    game.roundActive = false;

    // =================================================
    // DAS WORT WIRD ABSICHTLICH NICHT ÖFFENTLICH
    // =================================================

    await channel.send(
        "⏱️ **Zeit vorbei!**\n\n" +
        "Das Wort wurde nicht erraten.\n" +
        "➡️ Die nächste Runde startet in **3 Sekunden**."
    );

    game.nextRoundTimer = setTimeout(() => {
        if (game.running) {
            startTabuRound(channel).catch(console.error);
        }
    }, 3000);
}

// =====================================================
// TABU STOP
// =====================================================

async function stopTabu(interaction) {
    const game = getTabuGame(
        interaction.guild.id
    );

    if (!game.running) {
        return interaction.reply({
            content:
                "❌ Tabu läuft momentan nicht.",
            flags: MessageFlags.Ephemeral
        });
    }

    game.running = false;
    game.roundActive = false;

    clearTimeout(game.timer);
    clearTimeout(game.nextRoundTimer);

    game.timer = null;
    game.nextRoundTimer = null;

    game.currentWord = null;
    game.currentTaboo = [];
    game.currentExplainer = null;

    return interaction.reply(
        "🛑 **Tabu wurde beendet.**"
    );
}

// =====================================================
// TABU RANK
// =====================================================

async function tabuRank(interaction) {
    const scores = getTabuScores(
        interaction.guild.id
    );

    const ranking = Object.values(scores).sort(
        (a, b) => b.points - a.points
    );

    if (!ranking.length) {
        return interaction.reply(
            "🏆 **Tabu-Rangliste**\n\nNoch keine Punkte."
        );
    }

    let text = "🏆 **TABU-RANGLISTE**\n\n";

    ranking.forEach((user, index) => {
        const place =
            index === 0 ? "🥇" :
            index === 1 ? "🥈" :
            index === 2 ? "🥉" :
            `${index + 1}.`;

        text +=
            `${place} **${user.name}** — ` +
            `**${user.points} Punkte** ` +
            `(${user.correct} richtig)\n`;
    });

    return interaction.reply(text);
}

// =====================================================
// TABU RESET
// =====================================================

async function resetTabuRank(interaction) {
    if (
        !interaction.member.permissions.has(
            "Administrator"
        )
    ) {
        return interaction.reply({
            content:
                "❌ Dafür brauchst du Administrator-Rechte.",
            flags: MessageFlags.Ephemeral
        });
    }

    tabuScores[interaction.guild.id] = {};
    saveTabuScores();

    return interaction.reply(
        "🔄 **Tabu-Rangliste zurückgesetzt!**"
    );
}

// =====================================================
// TABU BUTTONS
// =====================================================

async function handleTabuButton(interaction) {
    const game = getTabuGame(
        interaction.guild.id
    );

    // =================================================
    // GEHEIMES WORT ANZEIGEN
    // =================================================

    if (
        interaction.customId ===
        "tabu_show_word"
    ) {
        return showPrivateTabuWord(
            interaction
        );
    }

    // =================================================
    // STOP
    // =================================================

    if (
        interaction.customId ===
        "tabu_stop"
    ) {
        return stopTabu(interaction);
    }

    // =================================================
    // BEITRETEN
    // =================================================

    if (
        interaction.customId ===
        "tabu_join"
    ) {
        if (!game.running) {
            return interaction.reply({
                content:
                    "❌ Tabu läuft nicht.",
                flags: MessageFlags.Ephemeral
            });
        }

        if (game.roundActive) {
            return interaction.reply({
                content:
                    "❌ Die Runde läuft bereits.",
                flags: MessageFlags.Ephemeral
            });
        }

        if (
            game.players.includes(
                interaction.user.id
            )
        ) {
            return interaction.reply({
                content:
                    "⚠️ Du bist bereits dabei.",
                flags: MessageFlags.Ephemeral
            });
        }

        game.players.push(
            interaction.user.id
        );

        await interaction.reply({
            content:
                "✅ **Du bist dabei!**",
            flags: MessageFlags.Ephemeral
        });

        // Die Lobby-Nachricht aktualisieren
        try {
            const messages =
                await interaction.channel.messages.fetch({
                    limit: 20
                });

            const lobbyMessage =
                messages.find(message =>
                    message.author.id ===
                        client.user.id &&
                    message.embeds.length &&
                    message.embeds[0].title ===
                        "🚫 TABU – Lobby"
                );

            if (lobbyMessage) {
                let playerText =
                    game.players
                        .map(
                            (id, index) =>
                                `${index + 1}. <@${id}>`
                        )
                        .join("\n");

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "🚫 TABU – Lobby"
                        )
                        .setDescription(
                            "👥 **Spieler**\n\n" +
                            playerText +
                            "\n\n" +
                            `👥 **${game.players.length} Spieler**\n\n` +
                            "Mindestens **2 Spieler** werden benötigt.\n\n" +
                            "Wenn alle dabei sind, kann ein Spieler auf **Runde starten** klicken."
                        );

                await lobbyMessage.edit({
                    embeds: [embed]
                });
            }
        } catch (error) {
            console.error(
                "❌ Lobby konnte nicht aktualisiert werden:",
                error
            );
        }

        return;
    }

    // =================================================
    // RUNDE STARTEN
    // =================================================

    if (
        interaction.customId ===
        "tabu_begin"
    ) {
        if (!game.running) {
            return interaction.reply({
                content:
                    "❌ Tabu läuft nicht.",
                flags: MessageFlags.Ephemeral
            });
        }

        if (game.players.length < 2) {
            return interaction.reply({
                content:
                    "❌ Mindestens **2 Spieler** werden benötigt.",
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.update({
            content:
                "🚫 **Tabu-Runde wird gestartet...**",
            embeds: [],
            components: []
        });

        return startTabuRound(
            interaction.channel
        );
    }

    // =================================================
    // WORT ERRATEN
    // =================================================

    if (
        interaction.customId ===
        "tabu_correct"
    ) {
        return showTabuGuessModal(
            interaction
        );
    }

    // =================================================
    // ÜBERSPRINGEN
    // =================================================

    if (
        interaction.customId ===
        "tabu_skip"
    ) {
        if (
            !game.running ||
            !game.roundActive
        ) {
            return interaction.reply({
                content:
                    "❌ Keine aktive Tabu-Runde.",
                flags: MessageFlags.Ephemeral
            });
        }

        if (
            interaction.user.id !==
            game.currentExplainer
        ) {
            return interaction.reply({
                content:
                    "❌ Nur der Erklärer darf überspringen.",
                flags: MessageFlags.Ephemeral
            });
        }

        clearTimeout(game.timer);
        game.timer = null;

        game.roundActive = false;
        game.skipped++;

        await interaction.reply({
            content:
                "⏭️ **Wort übersprungen!**",
            flags: MessageFlags.Ephemeral
        });

        // WICHTIG:
        // Das geheime Wort wird NICHT öffentlich angezeigt.

        await interaction.channel.send(
            "⏭️ **Das Wort wurde übersprungen!**\n" +
            "➡️ Nächste Runde startet in **2 Sekunden**."
        );

        game.nextRoundTimer = setTimeout(() => {
            if (game.running) {
                startTabuRound(
                    interaction.channel
                ).catch(console.error);
            }
        }, 2000);

        return;
    }
}

// =====================================================
// GAMES BUTTONS
// =====================================================

async function handleGamesButton(interaction) {
    const id = interaction.customId;

    const match = id.match(
        /^games_(play|stop|rank|reset)_(imposter|quiz|tabu|stadtlandfluss)$/
    );

    if (!match) {
        return;
    }

    const action = match[1];
    const game = match[2];

    if (action === "play") {
        if (game === "imposter") {
            return imposterGame.createLobby(
                interaction
            );
        }

        if (game === "quiz") {
            return startQuiz(interaction);
        }

        if (game === "tabu") {
            return startTabu(interaction);
        }

        if (game === "stadtlandfluss") {
            return startSlf(interaction);
        }

    }

    if (action === "stop") {
        if (game === "imposter") {
            const stopped =
                await imposterGame.stopGame(
                    interaction.guild.id,
                    `🛑 Das Imposter-Spiel wurde von ${interaction.user} beendet.`,
                    client
                );

            if (!stopped) {
                return interaction.reply({
                    content:
                        "❌ Kein Imposter-Spiel aktiv.",
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply(
                "🛑 **Imposter-Spiel beendet.**"
            );
        }

        if (game === "quiz") {
            return stopQuiz(interaction);
        }

        if (game === "tabu") {
            return stopTabu(interaction);
        }

        if (game === "stadtlandfluss") {
            return stopSlf(interaction);
        }

    }

    if (action === "rank") {
        if (game === "imposter") {
            return imposterGame.getLeaderboard(
                interaction
            );
        }

        if (game === "quiz") {
            return quizRank(interaction);
        }

        if (game === "tabu") {
            return tabuRank(interaction);
        }

        if (game === "stadtlandfluss") {
            return slfRank(interaction);
        }

    }

    if (action === "reset") {
        if (
            !interaction.member.permissions.has(
                "Administrator"
            )
        ) {
            return interaction.reply({
                content:
                    "❌ Dafür brauchst du Administrator-Rechte.",
                flags: MessageFlags.Ephemeral
            });
        }

        if (game === "imposter") {
            return imposterGame.resetLeaderboard(
                interaction
            );
        }

        if (game === "quiz") {
            return resetQuizRank(interaction);
        }

        if (game === "tabu") {
            return resetTabuRank(interaction);
        }

        if (game === "stadtlandfluss") {
            return resetSlfRank(interaction);
        }

    }
}

// =====================================================
// BOT ONLINE
// =====================================================

client.once(
    "clientReady",
    async () => {
        console.log(
            `✅ Bot online als ${client.user.tag}`
        );

        const commands = [
            new SlashCommandBuilder()
                .setName("games")
                .setDescription(
                    "Öffnet das Gruppen-Spiele-Menü"
                ),

            new SlashCommandBuilder()
                .setName("quiz")
                .setDescription(
                    "Startet das Quiz"
                ),

            new SlashCommandBuilder()
                .setName("stop")
                .setDescription(
                    "Stoppt das Quiz"
                ),

            new SlashCommandBuilder()
                .setName("rank")
                .setDescription(
                    "Zeigt die Quiz-Rangliste"
                ),

            new SlashCommandBuilder()
                .setName("reset")
                .setDescription(
                    "Setzt die Quiz-Rangliste zurück"
                ),

            new SlashCommandBuilder()
                .setName("imposter")
                .setDescription(
                    "Imposter-Spiel"
                )
                .addSubcommand(sub =>
                    sub
                        .setName("start")
                        .setDescription(
                            "Startet ein Imposter-Spiel"
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("stop")
                        .setDescription(
                            "Beendet das Imposter-Spiel"
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("help")
                        .setDescription(
                            "Zeigt die Imposter-Anleitung"
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("rank")
                        .setDescription(
                            "Zeigt die Imposter-Rangliste"
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("reset")
                        .setDescription(
                            "Setzt die Imposter-Rangliste zurück"
                        )
                )
        ].map(command => command.toJSON());

        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        try {
            for (const guildId of TEST_GUILD_IDS) {
                await rest.put(
                    Routes.applicationGuildCommands(
                        CLIENT_ID,
                        guildId
                    ),
                    {
                        body: commands
                    }
                );

                console.log(
                    `✅ Commands registriert für Server ${guildId}`
                );
            }
        } catch (error) {
            console.error(
                "❌ Fehler bei Commands:",
                error
            );
        }

        console.log(
            "📋 Spiele-System bereit."
        );

        console.log(
            `🚫 ${tabuWords.length} Tabu-Wörter verfügbar.`
        );
    }
);

// =====================================================
// INTERACTIONS
// =====================================================

client.on(
    "interactionCreate",
    async interaction => {
        try {
            if (!interaction.guild) {
                return interaction.reply({
                    content:
                        "❌ Dieser Bot funktioniert nur auf Discord-Servern.",
                    flags: MessageFlags.Ephemeral
                });
            }

            if (
                bannedUsers.includes(
                    interaction.user.id
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Du darfst diesen Bot nicht benutzen.",
                    flags: MessageFlags.Ephemeral
                });
            }

            // =========================================
            // MODALS
            // =========================================

            if (
                interaction.isModalSubmit()
            ) {
                if (
                    interaction.customId ===
                    "slf_answer_modal"
                ) {
                    return handleSlfAnswerModal(interaction);
                }

                if (
                    interaction.customId ===
                    "slf_vorname_modal"
                ) {
                    return handleSlfVornameModal(interaction);
                }


                if (
                    interaction.customId ===
                    "tabu_guess_modal"
                ) {
                    return handleTabuGuessModal(
                        interaction
                    );
                }

                return;
            }

            // =========================================
            // BUTTONS
            // =========================================

            if (interaction.isButton()) {

                if (interaction.customId === "slf_vorname") {
                    return showSlfVornameModal(interaction);
                }

                if (
                    interaction.customId.startsWith(
                        "slf_"
                    )
                ) {
                    return handleSlfButton(interaction);
                }

                if (
                    interaction.customId.startsWith(
                        "tabu_"
                    )
                ) {
                    return handleTabuButton(
                        interaction
                    );
                }

                if (
                    interaction.customId.startsWith(
                        "games_"
                    )
                ) {
                    return handleGamesButton(
                        interaction
                    );
                }

                if (
                    interaction.customId.startsWith(
                        "imposter_"
                    )
                ) {
                    return imposterGame.handleButton(
                        interaction
                    );
                }

                if (
                    interaction.customId.startsWith(
                        "answer_"
                    )
                ) {
                    return handleQuizAnswer(
                        interaction
                    );
                }

                return;
            }

            // =========================================
            // SELECT MENÜ
            // =========================================

            if (interaction.isStringSelectMenu()) {
                if (
                    interaction.customId ===
                    "games_select"
                ) {
                    const game =
                        interaction.values[0];

                    return showGameActions(
                        interaction,
                        game
                    );
                }


                if (
                    interaction.customId.startsWith(
                        "imposter_"
                    )
                ) {
                    return imposterGame.handleSelectMenu(
                        interaction
                    );
                }

                return;
            }

            // =========================================
            // SLASH COMMANDS
            // =========================================

            if (!interaction.isChatInputCommand()) {
                return;
            }

            const guildId =
                interaction.guild.id;

            if (
                interaction.commandName ===
                "games"
            ) {
                return showGamesMenu(
                    interaction
                );
            }

            if (
                interaction.commandName ===
                "imposter"
            ) {
                const subcommand =
                    interaction.options.getSubcommand();

                if (subcommand === "start") {
                    return imposterGame.createLobby(
                        interaction
                    );
                }

                if (subcommand === "stop") {
                    const stopped =
                        await imposterGame.stopGame(
                            guildId,
                            `🛑 Das Imposter-Spiel wurde von ${interaction.user} beendet.`,
                            client
                        );

                    if (!stopped) {
                        return interaction.reply({
                            content:
                                "❌ Auf diesem Server läuft momentan kein Imposter-Spiel.",
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    return interaction.reply(
                        "🛑 **Imposter-Spiel beendet.**"
                    );
                }

                if (subcommand === "rank") {
                    return imposterGame.getLeaderboard(
                        interaction
                    );
                }

                if (subcommand === "reset") {
                    if (
                        !interaction.member.permissions.has(
                            "Administrator"
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Dafür brauchst du Administrator-Rechte.",
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    return imposterGame.resetLeaderboard(
                        interaction
                    );
                }

                if (subcommand === "help") {
                    const embed =
                        new EmbedBuilder()
                            .setTitle(
                                "🕵️ Imposter – Anleitung"
                            )
                            .setDescription(
                                "**So funktioniert das Spiel:**\n\n" +
                                "👥 **1. Lobby**\n" +
                                "Mit `/imposter start` wird eine Lobby erstellt.\n\n" +
                                "🎮 **2. Beitreten**\n" +
                                "Alle Spieler klicken auf **Beitreten**.\n\n" +
                                "▶️ **3. Start**\n" +
                                "Der Leader startet das Spiel.\n\n" +
                                "🔐 **4. Geheimwort**\n" +
                                "Die normalen Spieler bekommen das Hauptwort.\n\n" +
                                "🕵️ **5. Imposter**\n" +
                                "Der Imposter bekommt ein Hilfswort.\n\n" +
                                "🗳️ **6. Abstimmung**\n" +
                                "Die Spieler versuchen den Imposter zu finden.\n\n" +
                                "🏆 **7. Punkte**\n" +
                                "Die Punkte werden gespeichert."
                            );

                    return interaction.reply({
                        embeds: [embed]
                    });
                }
            }

            if (
                interaction.commandName ===
                "quiz"
            ) {
                return startQuiz(
                    interaction
                );
            }

            if (
                interaction.commandName ===
                "stop"
            ) {
                return stopQuiz(
                    interaction
                );
            }

            if (
                interaction.commandName ===
                "rank"
            ) {
                return quizRank(
                    interaction
                );
            }

            if (
                interaction.commandName ===
                "reset"
            ) {
                return resetQuizRank(
                    interaction
                );
            }

        } catch (error) {
            console.error(
                "❌ Interaction-Fehler:",
                error
            );

            try {
                if (
                    interaction.replied ||
                    interaction.deferred
                ) {
                    return interaction.followUp({
                        content:
                            "❌ Es ist ein Fehler aufgetreten.",
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                return interaction.reply({
                    content:
                        "❌ Es ist ein Fehler aufgetreten.",
                    flags:
                        MessageFlags.Ephemeral
                });
            } catch (replyError) {
                console.error(
                    "❌ Fehler beim Senden der Fehlermeldung:",
                    replyError
                );
            }
        }
    }
);

// =====================================================
// FEHLER
// =====================================================

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "❌ Unhandled Rejection:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {
        console.error(
            "❌ Uncaught Exception:",
            error
        );
    }
);

// =====================================================
// LOGIN
// =====================================================

if (!TOKEN) {
    console.error(
        "❌ TOKEN wurde nicht gefunden. Setze die Umgebungsvariable TOKEN."
    );

    process.exit(1);
}

client.login(TOKEN);