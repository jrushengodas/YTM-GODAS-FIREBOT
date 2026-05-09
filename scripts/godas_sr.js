const https = require("https");
const fs = require("fs");
const path = require("path");

exports.getScriptManifest = () => ({
    name: "GODAS YTM V3 - Song Request",
    description: "Commande !sr + Reward SR pour GODAS YTM V3 sur Firebot",
    author: "Godas DEV",
    version: "2.2.0-smart-max-precision",
    firebotVersion: "5"
});

exports.getDefaultParameters = () => Promise.resolve({});

exports.run = async (runRequest) => {
    const logger = runRequest.modules.logger;
    const vars = runRequest.modules.customVariableManager;

    try {
        logger.info("🎵 GODAS SR SCRIPT LANCÉ");

        const config = loadConfig();
        const apiKeys = getApiKeys(config);

        const user = getUser(runRequest);
        const input = getInput(runRequest, logger);

        logger.info("CONFIG API KEYS = " + apiKeys.length);

        if (!input) {
            await setVar(vars, "ytm_sr_last_message_godas", `🎵 ${user}, utilise : !sr nom de musique ou lien YouTube`);
            return true;
        }

        if (apiKeys.length === 0) {
            await setVar(vars, "ytm_sr_last_message_godas", "❌ Setup incomplet, lance !godasytm.");
            return true;
        }

        let videoId = extractYoutubeVideoId(input);

        if (!videoId) {
            const bestResult = await searchBestMusic(apiKeys, input, logger);

            if (!bestResult) {
                await setVar(vars, "ytm_sr_last_message_godas", `❌ ${user}, aucune musique trouvée. Essaie avec un lien YouTube.`);
                return true;
            }

            videoId = bestResult.id.videoId;
        }

        const videoInfo = await getVideoInfoWithRetry(apiKeys, videoId, logger);

        if (!videoInfo) {
            await setVar(vars, "ytm_sr_last_message_godas", `❌ ${user}, vidéo introuvable.`);
            return true;
        }

        const title = videoInfo.snippet.title;
        const durationSeconds = parseYoutubeDurationToSeconds(videoInfo.contentDetails.duration);

        if (durationSeconds <= 0) {
            await setVar(vars, "ytm_sr_last_message_godas", `❌ ${user}, impossible d'analyser la durée.`);
            return true;
        }

        if (durationSeconds > 720) {
            await setVar(vars, "ytm_sr_last_message_godas", `❌ ${user}, la musique dépasse 12 minutes.`);
            return true;
        }

        const position = await addToQueue(vars, videoId, title, user, durationSeconds, logger);
        await addLocalHistory(vars, videoId, title, user, durationSeconds, position);

        await setVar(vars, "ytm_sr_last_message_godas", `🎶 ${user} a ajouté une SR en attente : ${title}`);

        logger.info("SR ajoutée : " + title + " | Position=" + position);

        return true;

    } catch (err) {
        logger.error("Erreur SR V3 Firebot : " + err.stack);

        try {
            await setVar(runRequest.modules.customVariableManager, "ytm_sr_last_message_godas", "❌ Erreur song request.");
        } catch {}

        return false;
    }
};

function loadConfig() {
    const configPath = path.join(__dirname, "godas_ytm_config.json");

    if (!fs.existsSync(configPath)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function getApiKeys(config) {
    if (!config) return [];

    if (Array.isArray(config.youtubeApiKeys)) {
        return config.youtubeApiKeys
            .map(key => key.toString().trim())
            .filter(key => key !== "");
    }

    if (config.youtubeApiKey) {
        return [config.youtubeApiKey.toString().trim()];
    }

    return [];
}

function getUser(runRequest) {
    const metadata = runRequest.trigger?.metadata || {};
    const userCommand = metadata.userCommand || {};
    const chatMessage = metadata.chatMessage || {};

    return (
        metadata.username ||
        metadata.userDisplayName ||
        metadata.userName ||
        userCommand.commandSender ||
        chatMessage.userDisplayName ||
        chatMessage.username ||
        "Viewer"
    );
}

function getInput(runRequest, logger) {
    const metadata = runRequest.trigger?.metadata || {};
    const userCommand = metadata.userCommand || {};
    const chatMessage = metadata.chatMessage || {};
    const parameters = runRequest.parameters || {};

    let input = "";

    if (Array.isArray(userCommand.args) && userCommand.args.length > 1) {
        input = userCommand.args.slice(1).join(" ");
    }

    if (!input && metadata.messageText) input = metadata.messageText;

    if (!input && Array.isArray(metadata.args) && metadata.args.length > 0) {
        input = metadata.args.join(" ");
    }

    if (!input && metadata.userInput) input = metadata.userInput;
    if (!input && metadata.rewardInput) input = metadata.rewardInput;
    if (!input && metadata.input) input = metadata.input;

    if (!input && parameters.userInput) input = parameters.userInput;
    if (!input && parameters.rewardInput) input = parameters.rewardInput;
    if (!input && parameters.input) input = parameters.input;

    if (!input && chatMessage.rawText) input = chatMessage.rawText;

    input = (input || "").toString().trim();
    input = input.replace(/^!sr\s*/i, "").trim();

    logger.info("SR INPUT FINAL = " + input);

    return input;
}

async function searchBestMusic(apiKeys, input, logger) {
    const variants = buildSearchVariants(input);

    let bestGlobal = null;
    let bestGlobalScore = -999999;

    for (let i = 0; i < variants.length; i++) {
        const query = variants[i];

        logger.info("VARIANTE RECHERCHE = " + query);

        const result = await searchWithUrl(apiKeys, query, logger);

        if (!result) continue;

        const score = result.__godasScore || 0;

        logger.info("TOP SCORE = " + score);

        if (score > bestGlobalScore) {
            bestGlobalScore = score;
            bestGlobal = result;
        }

        if (score >= 1600) {
            logger.info("STOP EARLY | SCORE PARFAIT");
            return result;
        }

        if (i >= 5 && bestGlobal && bestGlobalScore >= 1000) {
            logger.info("STOP EARLY | SCORE SOLIDE");
            return bestGlobal;
        }
    }

    return bestGlobal;
}

function buildSearchVariants(input) {
    const clean = input.trim();
    const normalized = clean.replace(/\s+/g, " ");
    const expanded = expandJoinedWords(normalized);

    const variants = [
        normalized,
        expanded,

        normalized + " official audio",
        expanded + " official audio",

        normalized + " official video",
        expanded + " official video",

        normalized + " music",
        expanded + " music",

        normalized + " lyrics",
        expanded + " lyrics"
    ];

    return [...new Set(
        variants
            .map(v => v.trim())
            .filter(v => v !== "")
    )];
}

function expandJoinedWords(input) {
    return input
        .split(/\s+/)
        .map(word => {
            let expanded = word;

            expanded = expanded.replace(/dj/gi, "dj ");
            expanded = expanded.replace(/mc/gi, "mc ");
            expanded = expanded.replace(/ft/gi, "ft ");
            expanded = expanded.replace(/feat/gi, "feat ");

            return expanded.replace(/\s+/g, " ").trim();
        })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

async function searchWithUrl(apiKeys, input, logger) {
    const buildUrl = (apiKey) =>
        "https://www.googleapis.com/youtube/v3/search" +
        "?part=snippet&type=video&maxResults=25" +
        "&q=" + encodeURIComponent(input.trim()) +
        "&key=" + encodeURIComponent(apiKey);

    const json = await youtubeRequestWithKeysRetry(apiKeys, buildUrl, logger, "SEARCH");

    if (!json) return null;

    const items = json.items || [];

    logger.info("RESULTATS YOUTUBE = " + items.length);

    if (items.length === 0) return null;

    return getBestScoredResult(items, input, logger);
}

async function getVideoInfoWithRetry(apiKeys, videoId, logger) {
    for (let i = 1; i <= 3; i++) {
        logger.info("VIDEO INFO TRY " + i + "/3 : " + videoId);

        const info = await getVideoInfo(apiKeys, videoId, logger);

        if (info) return info;

        await sleep(700);
    }

    return null;
}

async function getVideoInfo(apiKeys, videoId, logger) {
    const buildUrl = (apiKey) =>
        "https://www.googleapis.com/youtube/v3/videos" +
        "?part=snippet,contentDetails&id=" +
        encodeURIComponent(videoId) +
        "&key=" +
        encodeURIComponent(apiKey);

    const json = await youtubeRequestWithKeysRetry(apiKeys, buildUrl, logger, "VIDEO INFO");

    if (!json) return null;

    const items = json.items || [];

    logger.info("VIDEO INFO ITEMS = " + items.length);

    if (items.length === 0) return null;

    return items[0];
}

async function youtubeRequestWithKeysRetry(apiKeys, buildUrl, logger, label) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        logger.info(`${label} TRY ${attempt}/3`);

        const json = await youtubeRequestWithKeys(apiKeys, buildUrl, logger, label);

        if (json) return json;

        await sleep(700);
    }

    return null;
}

async function youtubeRequestWithKeys(apiKeys, buildUrl, logger, label) {
    for (let i = 0; i < apiKeys.length; i++) {
        const apiKey = apiKeys[i];
        const url = buildUrl(apiKey);

        logger.info(`YOUTUBE ${label} | Clé ${i + 1}/${apiKeys.length}`);

        try {
            return await httpGetJson(url);
        } catch (err) {
            const msg = err.message || "";

            logger.error(`Erreur YouTube clé ${i + 1} : ${msg}`);

            if (
                msg.includes("quotaExceeded") ||
                msg.includes("quota") ||
                msg.includes("403")
            ) {
                logger.info(`Quota clé ${i + 1} dépassé, tentative clé suivante...`);
                continue;
            }

            return null;
        }
    }

    logger.error("Toutes les clés API YouTube sont en quota ou invalides.");
    return null;
}

function httpGetJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            let data = "";

            res.on("data", chunk => {
                data += chunk;
            });

            res.on("end", () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error("HTTP " + res.statusCode + " : " + data));
                    return;
                }

                try {
                    resolve(JSON.parse(data));
                } catch (err) {
                    reject(err);
                }
            });
        });

        req.setTimeout(30000, () => {
            req.destroy(new Error("Timeout HTTPS"));
        });

        req.on("error", reject);
    });
}

function getBestScoredResult(items, input, logger) {
    const cleanInput = normalize(input);
    const words = cleanInput.split(" ").filter(Boolean);

    let best = null;
    let bestScore = -999999;

    for (const item of items) {
        if (!item || !item.snippet) continue;

        const titleRaw = item.snippet.title || "";
        const channelRaw = item.snippet.channelTitle || "";

        const title = normalize(titleRaw);
        const channel = normalize(channelRaw);

        let score = 0;
        let matchedWords = 0;

        for (const word of words) {
            if (word.length <= 1) continue;

            if (title.includes(word)) {
                matchedWords++;
            }
        }

        if (matchedWords === words.length) score += 1000;
        if (matchedWords === 0) score -= 2000;

        score += matchedWords * 150;

        if (title.includes(cleanInput)) {
            score += 500;
        }

        if (
            title.startsWith(cleanInput) ||
            cleanInput.startsWith(title)
        ) {
            score += 800;
        }

        for (const word of words) {
            if (word.length <= 1) continue;

            if (title.includes(word)) score += 80;
            if (channel.includes(word)) score += 25;
        }

        if (title.includes("official audio") || title.includes("audio officiel")) score += 120;
        if (title.includes("official video") || title.includes("clip officiel")) score += 90;
        if (channel.includes("official") || channel.includes("officiel") || channel.includes("vevo")) score += 60;
        if (title.includes("lyrics") || title.includes("paroles")) score += 20;

        if (
            title.includes("speed up") ||
            title.includes("sped up") ||
            title.includes("slowed") ||
            title.includes("nightcore") ||
            title.includes("reverb") ||
            title.includes("remix") ||
            title.includes("edit audio")
        ) {
            score -= 500;
        }

        if (
            title.includes("reaction") ||
            title.includes("cover") ||
            title.includes("karaoke") ||
            title.includes("instrumental") ||
            title.includes("live") ||
            title.includes("concert")
        ) {
            score -= 200;
        }

        if (title.includes("playlist") || title.includes("mix")) {
            score -= 300;
        }

        for (const word of words) {
            if (word.length <= 2) continue;

            if (!title.includes(word) && !channel.includes(word)) {
                score -= 250;
            }
        }

        item.__godasScore = score;

        logger.info("SCORE | " + score + " | " + titleRaw + " | " + channelRaw);

        if (score > bestScore) {
            bestScore = score;
            best = item;
        }
    }

    if (best) {
        best.__godasScore = bestScore;
        logger.info("MEILLEUR RESULTAT = " + best.snippet.title + " | Score=" + bestScore);
    }

    return best;
}

async function getVar(vars, name) {
    if (!vars) return null;

    if (typeof vars.getCustomVariable === "function") {
        const value = await vars.getCustomVariable(name);

        if (value && typeof value === "object" && "value" in value) {
            return value.value;
        }

        return value;
    }

    return null;
}

async function setVar(vars, name, value) {
    if (!vars) return;

    if (typeof vars.setCustomVariable === "function") {
        await vars.setCustomVariable(name, value);
        return;
    }

    if (typeof vars.addCustomVariable === "function") {
        await vars.addCustomVariable(name, value);
    }
}

async function addToQueue(vars, videoId, title, user, durationSeconds, logger) {
    let queue = await getVar(vars, "ytm_sr_queue_godas");

    if (!Array.isArray(queue)) {
        try {
            queue = JSON.parse(queue || "[]");
        } catch {
            queue = [];
        }
    }

    const song = {
        videoId,
        title,
        user,
        durationSeconds,
        durationText: formatDuration(durationSeconds),
        priority: false,
        url: "https://music.youtube.com/watch?v=" + videoId,
        addedAt: getDateTime()
    };

    queue.push(song);

    await setVar(vars, "ytm_sr_queue_godas", JSON.stringify(queue));

    logger.info("QUEUE SAUVEGARDÉE = " + JSON.stringify(queue));

    return queue.length;
}

async function addLocalHistory(vars, videoId, title, user, durationSeconds, position) {
    let history = await getVar(vars, "ytm_sr_history_godas");

    if (!Array.isArray(history)) {
        try {
            history = JSON.parse(history || "[]");
        } catch {
            history = [];
        }
    }

    history.push({
        videoId,
        title,
        user,
        durationSeconds,
        durationText: formatDuration(durationSeconds),
        position,
        type: "normal",
        url: "https://music.youtube.com/watch?v=" + videoId,
        addedAt: getDateTime()
    });

    await setVar(vars, "ytm_sr_history_godas", JSON.stringify(history));
}

function parseYoutubeDurationToSeconds(duration) {
    if (!duration) return 0;

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

    if (!match) return 0;

    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const seconds = match[3] ? parseInt(match[3], 10) : 0;

    return hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return String(minutes).padStart(2, "0") + ":" + String(remainingSeconds).padStart(2, "0");
}

function extractYoutubeVideoId(input) {
    if (!input) return null;

    input = input.trim();

    let match = input.match(/(?:youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);

    if (match) return match[1];

    match = input.match(/[?&]v=([a-zA-Z0-9_-]{11})/);

    if (match) return match[1];

    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

    return null;
}

function normalize(text) {
    if (!text) return "";

    return text
        .toLowerCase()
        .replace(/-/g, " ")
        .replace(/_/g, " ")
        .replace(/'/g, " ")
        .replace(/’/g, " ")
        .replace(/[()[\].,:;!?&]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getDateTime() {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}