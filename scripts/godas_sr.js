const https = require("https");
const fs = require("fs");
const path = require("path");

exports.getScriptManifest = () => ({
    name: "GODAS YTM V3.1 - Song Request",
    description: "Commande !sr + Reward SR pour GODAS YTM V3.1",
    author: "Godas DEV",
    version: "3.1.0",
    firebotVersion: "5"
});

exports.getDefaultParameters = () => Promise.resolve({});

const QUEUE_KEY = "ytm_sr_queue_godas";
const HISTORY_KEY = "ytm_sr_history_godas";
const CACHE_KEY = "ytm_sr_cache_godas";
const SENT_KEY = "ytm_sr_sent_videoid_godas";

const MAX_DURATION_SECONDS = 720;
const CACHE_VALID_DAYS = 90;
const CACHE_INVALID_DAYS = 14;
const CACHE_MAX_ITEMS = 1000;

exports.run = async (runRequest) => {
    const logger = runRequest.modules.logger;
    const vars = runRequest.modules.customVariableManager;

    try {
        logger.info("SR V3.1 | SCRIPT LANCÉ");

        const config = loadConfig();
        const apiKeys = getApiKeys(config);

        const user = getUser(runRequest);
        const inputRaw = getInput(runRequest, logger);
        const input = (inputRaw || "").trim();

        if (!input) {
            await setVar(vars, "ytm_sr_last_message_godas", `🎵 ${user}, utilise : !sr nom de musique ou lien YouTube`);
            return true;
        }

        if (isYoutubeShortUrl(input)) {
            await setVar(vars, "ytm_sr_last_message_godas", `❌ ${user}, les YouTube Shorts sont refusés pour les SR.`);
            return true;
        }

        if (apiKeys.length === 0) {
            await setVar(vars, "ytm_sr_last_message_godas", "❌ Setup incomplet, lance !godasytm.");
            return true;
        }

        await cleanSrCache(vars, logger);

        let videoId = extractYoutubeVideoId(input);
        const isDirectLink = !!videoId;
        const cacheKey = buildCacheKey(input, isDirectLink, videoId);

        let cached = await getFromCache(vars, cacheKey, logger);

        let title = "";
        let durationSeconds = 0;
        let source = isDirectLink ? "link" : "search";

        if (cached) {
            videoId = cached.videoId || "";
            title = cached.title || "Titre inconnu";
            durationSeconds = parseInt(cached.durationSeconds || 0, 10) || 0;

            logger.info(`SR CACHE HIT | ${cacheKey} | ${title}`);
        } else {
            if (!isDirectLink) {
                const bestResult = await searchBestMusic(apiKeys, input, logger);

                if (!bestResult) {
                    await setVar(vars, "ytm_sr_last_message_godas", `❌ ${user}, aucune musique trouvée. Essaie avec un lien YouTube classique.`);
                    return true;
                }

                videoId = bestResult.id?.videoId || "";
            } else {
                const originalInfo = await getVideoInfoWithRetry(apiKeys, videoId, logger);

                if (originalInfo) {
                    const originalTitle = originalInfo.snippet?.title || "";
                    const originalChannel = originalInfo.snippet?.channelTitle || "";

                    const searchInput = `${originalTitle} ${originalChannel}`.trim();

                    logger.info("SR LINK REMAP SEARCH | " + searchInput);

                    const bestResult = await searchBestMusic(apiKeys, searchInput, logger);

                    if (bestResult?.id?.videoId) {
                        logger.info("SR LINK REMAP | " + videoId + " -> " + bestResult.id.videoId);
                        videoId = bestResult.id.videoId;
                        source = "link_remap";
                    }
                }
            }

            if (!videoId) {
                await setVar(vars, "ytm_sr_last_message_godas", `❌ ${user}, vidéo introuvable.`);
                return true;
            }

            const videoInfo = await getVideoInfoWithRetry(apiKeys, videoId, logger);

            if (!videoInfo) {
                await markCacheInvalid(vars, cacheKey, videoId, "video_info_null", logger);
                await setVar(vars, "ytm_sr_last_message_godas", `❌ ${user}, vidéo introuvable.`);
                return true;
            }

            title = videoInfo.snippet?.title || "Titre inconnu";
            const description = videoInfo.snippet?.description || "";

            if (isShortContent(normalize(title), normalize(description))) {
                await markCacheInvalid(vars, cacheKey, videoId, "short_refused", logger);
                await setVar(vars, "ytm_sr_last_message_godas", `❌ ${user}, cette vidéo ressemble à un Short, SR refusée.`);
                return true;
            }

            durationSeconds = parseYoutubeDurationToSeconds(videoInfo.contentDetails?.duration || "");

            if (durationSeconds <= 0) {
                await markCacheInvalid(vars, cacheKey, videoId, "duration_invalid", logger);
                await setVar(vars, "ytm_sr_last_message_godas", `❌ ${user}, impossible d'analyser la durée.`);
                return true;
            }

            await saveToCache(vars, cacheKey, {
                videoId,
                title,
                durationSeconds,
                durationText: formatDuration(durationSeconds),
                valid: true,
                source,
                uses: 0,
                failCount: 0,
                createdAt: getDateTime(),
                lastUsed: getDateTime()
            }, logger);
        }

        if (durationSeconds > MAX_DURATION_SECONDS) {
            await markCacheInvalid(vars, cacheKey, videoId, "too_long", logger);
            await setVar(vars, "ytm_sr_last_message_godas", `❌ ${user}, la musique dépasse 12 minutes.`);
            return true;
        }

        if (await alreadyInQueue(vars, videoId)) {
            await setVar(vars, "ytm_sr_last_message_godas", `⚠️ ${user}, cette SR est déjà dans la file.`);
            return true;
        }

        await touchCache(vars, cacheKey, logger);

        const position = await addToQueue(vars, videoId, title, user, durationSeconds, cacheKey, source, input, logger);
        await addLocalHistory(vars, videoId, title, user, durationSeconds, position, cacheKey, source, input);

        await setVar(vars, "ytm_sr_last_message_godas", `🎶 ${user} a ajouté une SR en attente : ${title}`);
        logger.info("SR V3.1 | AJOUTÉE : " + title + " | Position=" + position);

        return true;
    } catch (err) {
        logger.error("Erreur SR V3.1 Firebot : " + err.stack);

        try {
            await setVar(runRequest.modules.customVariableManager, "ytm_sr_last_message_godas", "❌ Erreur song request.");
        } catch {}

        return false;
    }
};

function loadConfig() {
    const configPath = path.join(__dirname, "godas_ytm_config.json");

    if (!fs.existsSync(configPath)) return null;

    try {
        return JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
        return null;
    }
}

function getApiKeys(config) {
    if (!config) return [];

    if (Array.isArray(config.youtubeApiKeys)) {
        return config.youtubeApiKeys.map(key => key.toString().trim()).filter(key => key !== "");
    }

    if (config.youtubeApiKey) return [config.youtubeApiKey.toString().trim()];

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

        logger.info("SR V3.1 | VARIANTE RECHERCHE = " + query);

        const result = await searchWithUrl(apiKeys, query, logger);

        if (!result) continue;

        const score = result.__godasScore || 0;

        logger.info("SR V3.1 | TOP SCORE = " + score);

        if (score > bestGlobalScore) {
            bestGlobalScore = score;
            bestGlobal = result;
        }

        if (score >= 2800) {
            logger.info("SR V3.1 | STOP EARLY | SCORE PARFAIT");
            return result;
        }

        if (i >= 10 && bestGlobal && bestGlobalScore >= 1900) {
            logger.info("SR V3.1 | STOP EARLY | SCORE SOLIDE");
            return bestGlobal;
        }
    }

    return bestGlobal;
}

function buildSearchVariants(input) {
    const normalized = input.trim().replace(/\s+/g, " ");
    const expanded = expandJoinedWords(normalized);

    const variants = [];

    const deMatch = normalized.match(/^(.*?)\s+de\s+(.+)$/i);

    if (deMatch) {
        const deTitle = deMatch[1].trim();
        const deArtist = deMatch[2].trim();

        addPairVariants(variants, deArtist, deTitle);
        addPairVariants(variants, deTitle, deArtist);
    }

    const parts = normalized.split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
        for (let cut = 1; cut < parts.length; cut++) {
            const left = parts.slice(0, cut).join(" ");
            const right = parts.slice(cut).join(" ");

            addPairVariants(variants, left, right);
            addPairVariants(variants, right, left);
        }
    }

    variants.push(normalized + " official audio");
    variants.push(expanded + " official audio");
    variants.push(normalized + " audio officiel");
    variants.push(expanded + " audio officiel");
    variants.push(normalized + " official video");
    variants.push(expanded + " official video");
    variants.push(normalized + " clip officiel");
    variants.push(expanded + " clip officiel");
    variants.push(normalized + " topic");
    variants.push(expanded + " topic");
    variants.push(normalized + " youtube music");
    variants.push(expanded + " youtube music");
    variants.push(normalized + " provided to youtube");
    variants.push(expanded + " provided to youtube");
    variants.push(normalized);
    variants.push(expanded);

    return [...new Set(variants.map(v => v.trim()).filter(Boolean))];
}

function addPairVariants(variants, a, b) {
    if (!a || !b) return;

    a = a.trim();
    b = b.trim();

    variants.push(a + " " + b);
    variants.push(a + " - " + b);
    variants.push(a + " topic " + b);
    variants.push(a + " " + b + " topic");
    variants.push(a + " " + b + " youtube music");
    variants.push(a + " " + b + " official audio");
    variants.push(a + " " + b + " provided to youtube");
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
        "&videoCategoryId=10" +
        "&q=" + encodeURIComponent(input.trim()) +
        "&key=" + encodeURIComponent(apiKey);

    const json = await youtubeRequestWithKeysRetry(apiKeys, buildUrl, logger, "SEARCH");

    if (!json) return null;

    const items = json.items || [];

    logger.info("SR V3.1 | RESULTATS YOUTUBE = " + items.length);

    if (items.length === 0) return null;

    return getBestScoredResult(items, input, logger);
}

async function getVideoInfoWithRetry(apiKeys, videoId, logger) {
    for (let i = 1; i <= 3; i++) {
        logger.info("SR V3.1 | VIDEO INFO TRY " + i + "/3 : " + videoId);

        const info = await getVideoInfo(apiKeys, videoId, logger);

        if (info) return info;

        await sleep(700);
    }

    return null;
}

async function getVideoInfo(apiKeys, videoId, logger) {
    const buildUrl = (apiKey) =>
        "https://www.googleapis.com/youtube/v3/videos" +
        "?part=snippet,contentDetails,status&id=" +
        encodeURIComponent(videoId) +
        "&key=" +
        encodeURIComponent(apiKey);

    const json = await youtubeRequestWithKeysRetry(apiKeys, buildUrl, logger, "VIDEO INFO");

    if (!json) return null;

    const items = json.items || [];

    logger.info("SR V3.1 | VIDEO INFO ITEMS = " + items.length);

    if (items.length === 0) return null;

    return items[0];
}

async function youtubeRequestWithKeysRetry(apiKeys, buildUrl, logger, label) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        logger.info(`SR V3.1 | ${label} TRY ${attempt}/3`);

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

        logger.info(`SR V3.1 | YOUTUBE ${label} | Clé ${i + 1}/${apiKeys.length}`);

        try {
            return await httpGetJson(url);
        } catch (err) {
            const msg = err.message || "";

            logger.error(`SR V3.1 | Erreur YouTube clé ${i + 1} : ${msg}`);

            if (
                msg.includes("quotaExceeded") ||
                msg.includes("dailyLimitExceeded") ||
                msg.includes("quota") ||
                msg.includes("403") ||
                msg.includes("400") ||
                msg.includes("API_KEY_INVALID") ||
                msg.includes("API key expired") ||
                msg.includes("keyInvalid") ||
                msg.includes("accessNotConfigured")
            ) {
                logger.info(`SR V3.1 | Clé ${i + 1} ignorée, tentative clé suivante...`);
                continue;
            }

            return null;
        }
    }

    logger.error("SR V3.1 | Toutes les clés API YouTube sont en quota ou invalides.");
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
        const descriptionRaw = item.snippet.description || "";

        const title = normalize(titleRaw);
        const channel = normalize(channelRaw);
        const description = normalize(descriptionRaw);

        if (isShortContent(title, description)) continue;

        let score = 0;
        let matchedWords = 0;
        let totalUsefulWords = 0;

        for (const word of words) {
            if (word.length <= 1) continue;

            totalUsefulWords++;

            if (
                title.includes(word) ||
                channel.includes(word) ||
                isCloseWordInText(word, title) ||
                isCloseWordInText(word, channel)
            ) {
                matchedWords++;
            }
        }

        if (totalUsefulWords > 0 && matchedWords === totalUsefulWords) score += 1600;
        if (matchedWords === 0) score -= 2200;

        score += matchedWords * 180;

        if (title.includes(cleanInput)) score += 900;
        if (channel.includes(cleanInput)) score += 600;

        if (title.startsWith(cleanInput) || cleanInput.startsWith(title)) {
            score += 800;
        }

        for (let cut = 1; cut < words.length; cut++) {
            const left = words.slice(0, cut).join(" ");
            const right = words.slice(cut).join(" ");

            if (containsClosePhrase(title, left) && containsClosePhrase(channel, right)) score += 3200;
            if (containsClosePhrase(title, right) && containsClosePhrase(channel, left)) score += 3200;
            if (containsClosePhrase(title, left) && containsClosePhrase(title, right)) score += 1800;
        }

        for (const word of words) {
            if (word.length <= 1) continue;

            if (title.includes(word)) score += 110;
            if (channel.includes(word)) score += 140;
            if (description.includes(word)) score += 10;

            if (isCloseWordInText(word, title)) score += 80;
            if (isCloseWordInText(word, channel)) score += 120;
        }

        if (title.includes("official audio") || title.includes("audio officiel")) score += 350;
        if (title.includes("official video") || title.includes("clip officiel")) score += 220;
        if (channel.includes("official") || channel.includes("officiel")) score += 180;
        if (channel.includes("vevo")) score += 350;
        if (channel.includes("topic")) score += 650;
        if (description.includes("provided to youtube by") || title.includes("provided to youtube by")) score += 300;
        if (title.includes("lyrics") || title.includes("paroles")) score += 25;

        if (
            title.includes("speed up") ||
            title.includes("sped up") ||
            title.includes("slowed") ||
            title.includes("nightcore") ||
            title.includes("reverb") ||
            title.includes("remix") ||
            title.includes("edit audio") ||
            title.includes("tiktok") ||
            title.includes("tik tok")
        ) {
            score -= 700;
        }

        if (
            title.includes("reaction") ||
            title.includes("cover") ||
            title.includes("karaoke") ||
            title.includes("instrumental") ||
            title.includes("live") ||
            title.includes("concert")
        ) {
            score -= 300;
        }

        if (title.includes("playlist") || title.includes("mix") || title.includes("compilation")) {
            score -= 600;
        }

        for (const word of words) {
            if (word.length <= 2) continue;

            if (
                !title.includes(word) &&
                !channel.includes(word) &&
                !isCloseWordInText(word, title) &&
                !isCloseWordInText(word, channel)
            ) {
                score -= 120;
            }
        }

        item.__godasScore = score;

        logger.info("SR V3.1 | SCORE | " + score + " | " + titleRaw + " | " + channelRaw);

        if (score > bestScore) {
            bestScore = score;
            best = item;
        }
    }

    if (best) {
        best.__godasScore = bestScore;
        logger.info("SR V3.1 | MEILLEUR RESULTAT = " + best.snippet.title + " | Score=" + bestScore);
    }

    if (!best) return null;

    if (bestScore < 150) {
        logger.info("SR FALLBACK | Score faible mais résultat conservé : " + bestScore);
    }

    return best;
}

function containsClosePhrase(text, phrase) {
    text = normalize(text);
    phrase = normalize(phrase);

    if (!text || !phrase) return false;
    if (text.includes(phrase)) return true;

    const words = phrase.split(" ").filter(Boolean);
    let ok = 0;

    for (const word of words) {
        if (word.length <= 1) continue;

        if (text.includes(word) || isCloseWordInText(word, text)) {
            ok++;
        }
    }

    return ok >= Math.max(1, words.length - 1);
}

function isCloseWordInText(word, text) {
    if (!word || !text) return false;

    const parts = text.split(" ").filter(Boolean);

    for (const part of parts) {
        if (isCloseWord(word, part)) return true;
    }

    return false;
}

function isCloseWord(a, b) {
    a = normalize(a);
    b = normalize(b);

    if (a === b) return true;
    if (a.length < 4 || b.length < 4) return false;

    const d = levenshtein(a, b);
    const max = Math.max(a.length, b.length);

    if (max <= 5) return d <= 1;
    if (max <= 8) return d <= 2;

    return d <= 3;
}

function levenshtein(s, t) {
    const n = s.length;
    const m = t.length;
    const d = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

    for (let i = 0; i <= n; i++) d[i][0] = i;
    for (let j = 0; j <= m; j++) d[0][j] = j;

    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;

            d[i][j] = Math.min(
                d[i - 1][j] + 1,
                d[i][j - 1] + 1,
                d[i - 1][j - 1] + cost
            );
        }
    }

    return d[n][m];
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

async function alreadyInQueue(vars, videoId) {
    if (!videoId) return false;

    const sentVideoId = await getVar(vars, SENT_KEY);

    if (sentVideoId && sentVideoId === videoId) return true;

    let queue = await getVar(vars, QUEUE_KEY);

    if (!Array.isArray(queue)) {
        try {
            queue = JSON.parse(queue || "[]");
        } catch {
            queue = [];
        }
    }

    return queue.some(song => song && song.videoId === videoId);
}

async function addToQueue(vars, videoId, title, user, durationSeconds, cacheKey, source, originalInput, logger) {
    let queue = await getVar(vars, QUEUE_KEY);

    if (!Array.isArray(queue)) {
        try {
            queue = JSON.parse(queue || "[]");
        } catch {
            queue = [];
        }
    }

    if (queue.some(song => song && song.videoId === videoId)) {
        return queue.length;
    }

    const song = {
        videoId,
        title,
        user,
        durationSeconds,
        durationText: formatDuration(durationSeconds),
        priority: false,
        sentToYTM: false,
        url: "https://music.youtube.com/watch?v=" + videoId,
        cacheKey,
        source,
        originalInput,
        addedAt: getDateTime()
    };

    queue.push(song);

    await setVar(vars, QUEUE_KEY, JSON.stringify(queue));

    logger.info("SR V3.1 | QUEUE SAUVEGARDÉE = " + JSON.stringify(queue));

    return queue.length;
}

async function addLocalHistory(vars, videoId, title, user, durationSeconds, position, cacheKey, source, originalInput) {
    let history = await getVar(vars, HISTORY_KEY);

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
        cacheKey,
        source,
        originalInput,
        addedAt: getDateTime()
    });

    await setVar(vars, HISTORY_KEY, JSON.stringify(history));
}

async function getCache(vars) {
    let cache = await getVar(vars, CACHE_KEY);

    if (!cache) return {};

    if (typeof cache === "object" && !Array.isArray(cache)) return cache;

    try {
        return JSON.parse(cache);
    } catch {
        return {};
    }
}

async function saveFullCache(vars, cache) {
    await setVar(vars, CACHE_KEY, JSON.stringify(cache));
}

async function getFromCache(vars, cacheKey, logger) {
    const cache = await getCache(vars);

    if (!cache[cacheKey]) return null;

    const item = cache[cacheKey];

    if (item.valid === false) return null;
    if (!item.videoId || !item.durationSeconds) return null;

    logger.info("SR V3.1 | CACHE FOUND | " + cacheKey);

    return item;
}

async function saveToCache(vars, cacheKey, data, logger) {
    const cache = await getCache(vars);

    cache[cacheKey] = {
        ...(cache[cacheKey] || {}),
        ...data,
        updatedAt: getDateTime()
    };

    await saveFullCache(vars, cache);

    logger.info("SR V3.1 | CACHE SAVE | " + cacheKey);
}

async function touchCache(vars, cacheKey, logger) {
    const cache = await getCache(vars);

    if (!cache[cacheKey]) return;

    const uses = parseInt(cache[cacheKey].uses || 0, 10) || 0;

    cache[cacheKey].uses = uses + 1;
    cache[cacheKey].lastUsed = getDateTime();
    cache[cacheKey].updatedAt = getDateTime();

    await saveFullCache(vars, cache);

    logger.info("SR V3.1 | CACHE TOUCH | " + cacheKey);
}

async function markCacheInvalid(vars, cacheKey, videoId, reason, logger) {
    if (!cacheKey) return;

    const cache = await getCache(vars);

    if (!cache[cacheKey]) cache[cacheKey] = {};

    cache[cacheKey].videoId = videoId || "";
    cache[cacheKey].valid = false;
    cache[cacheKey].lastFailReason = reason;
    cache[cacheKey].lastFailAt = getDateTime();
    cache[cacheKey].updatedAt = getDateTime();

    const failCount = parseInt(cache[cacheKey].failCount || 0, 10) || 0;
    cache[cacheKey].failCount = failCount + 1;

    await saveFullCache(vars, cache);

    logger.info("SR V3.1 | CACHE INVALIDATED | " + cacheKey + " | " + reason);
}

async function cleanSrCache(vars, logger) {
    const cache = await getCache(vars);
    const clean = {};

    const now = Date.now();
    let kept = 0;
    let removed = 0;

    for (const key of Object.keys(cache)) {
        if (kept >= CACHE_MAX_ITEMS) {
            removed++;
            continue;
        }

        const item = cache[key];

        if (!item) {
            removed++;
            continue;
        }

        const valid = item.valid !== false;

        const dateStr =
            item.lastUsed ||
            item.updatedAt ||
            item.createdAt ||
            item.lastFailAt;

        const time = dateStr ? new Date(dateStr).getTime() : now;
        const ageDays = (now - time) / (1000 * 60 * 60 * 24);

        if (valid && ageDays > CACHE_VALID_DAYS) {
            removed++;
            continue;
        }

        if (!valid && ageDays > CACHE_INVALID_DAYS) {
            removed++;
            continue;
        }

        clean[key] = item;
        kept++;
    }

    if (removed > 0) {
        await saveFullCache(vars, clean);
        logger.info("SR V3.1 | CACHE CLEANUP | Removed=" + removed);
    }
}

function buildCacheKey(input, isDirectLink, videoId) {
    if (isDirectLink) return "id:" + videoId;
    return "q:" + normalize(input);
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

    if (isYoutubeShortUrl(input)) return null;

    let match = input.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];

    match = input.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];

    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

    return null;
}

function isYoutubeShortUrl(input) {
    if (!input) return false;

    return /youtube\.com\/shorts\//i.test(input) ||
           /youtu\.be\/shorts\//i.test(input);
}

function isShortContent(title, description) {
    title = title || "";
    description = description || "";

    if (title.includes("#shorts") || description.includes("#shorts")) return true;
    if (title.includes(" shorts ") || description.includes(" shorts ")) return true;
    if (title.includes("ytshorts") || description.includes("ytshorts")) return true;
    if (title.includes("shortsfeed") || description.includes("shortsfeed")) return true;

    return false;
}

function normalize(text) {
    if (!text) return "";

    return text
        .toLowerCase()
        .replace(/-/g, " ")
        .replace(/_/g, " ")
        .replace(/'/g, " ")
        .replace(/’/g, " ")
        .replace(/[()[\].,:;!?&/]/g, " ")
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
