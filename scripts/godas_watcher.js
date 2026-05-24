const fs = require("fs");
const path = require("path");

exports.getScriptManifest = () => ({
    name: "GODAS YTM V3.1 - Watcher",
    description: "Queue locale ordre maître + une SR à la fois",
    author: "Godas DEV",
    version: "3.1.4",
    firebotVersion: "5"
});

exports.getDefaultParameters = () => Promise.resolve({});

const QUEUE_KEY = "ytm_sr_queue_godas";
const ACTIVE_KEY = "ytm_sr_active_videoid_godas";
const LOCK_KEY = "ytm_sr_lock_godas";

const SENT_KEY = "ytm_sr_sent_videoid_godas";
const SENT_SINCE_KEY = "ytm_sr_sent_since_godas";

const STUCK_VIDEO_KEY = "ytm_sr_stuck_videoid_godas";
const STUCK_SINCE_KEY = "ytm_sr_stuck_since_godas";
const LAST_LAUNCH_KEY = "ytm_sr_last_launch_ticks_godas";

const STUCK_TIMEOUT_MS = 10000;
const SENT_TIMEOUT_MS = 240000;
const COOLDOWN_MS = 2000;

exports.run = async (runRequest) => {
    const logger = runRequest.modules.logger;
    const vars = runRequest.modules.customVariableManager;

    try {
        const config = loadConfig();
        const host = config?.ytmHost || "127.0.0.1";
        const port = config?.ytmPort || "26538";

        if (((await getVar(vars, LOCK_KEY)) || "false") === "true") {
            logger.info("WATCHER V3.1 | Lock actif.");
            return true;
        }

        const currentSong = await getCurrentSong(host, port);
        const currentVideoId = currentSong ? getCurrentVideoId(currentSong) : "";
        const elapsed = getNumber(currentSong, ["elapsedSeconds"]);
        const duration = getNumber(currentSong, ["songDuration"]);
        const paused = getBool(currentSong, ["isPaused"]);

        let queue = await getQueue(vars, logger);
        let sentVideoId = (await getVar(vars, SENT_KEY)) || "";

        logger.info(`WATCHER V3.1 | Current=${currentVideoId} | elapsed=${elapsed} | paused=${paused} | Sent=${sentVideoId} | Queue=${queue.length}`);

        // Si la SR envoyée devient vraiment current, on la retire enfin de la queue locale
        if (sentVideoId && currentVideoId === sentVideoId && elapsed > 1) {
            queue = removeSongFromQueue(queue, sentVideoId);
            await setVar(vars, QUEUE_KEY, JSON.stringify(queue));
            await setVar(vars, SENT_KEY, "");
            await setVar(vars, SENT_SINCE_KEY, "");
            await setVar(vars, ACTIVE_KEY, sentVideoId);

            logger.info("WATCHER V3.1 | SR jouée, retirée de la queue locale : " + sentVideoId);

            sentVideoId = "";
        }

        if (currentVideoId && elapsed > 1) {
            await setCurrentFromYtm(vars, currentSong);
        }

        const playerFrozen = currentVideoId && elapsed <= 1 && duration > 0 && !paused;

        if (playerFrozen) {
            if (!(await stuckTimedOut(vars, currentVideoId))) {
                logger.info("WATCHER V3.1 | Musique à 0:00, attente avant déblocage.");
            } else {
                logger.info("WATCHER V3.1 | Musique bloquée à 0:00, tentative déblocage : " + currentVideoId);
                await trySkipPlayer(host, port, logger);
                await setVar(vars, STUCK_VIDEO_KEY, "");
                await setVar(vars, STUCK_SINCE_KEY, "");
            }
        }

        if (!queue || queue.length === 0) {
            return true;
        }

        // Une SR est déjà envoyée à YTM : elle attend qu'elle passe current avant d'envoyer la suivante
if (sentVideoId) {
    if (await sentTimedOut(vars)) {
        logger.info("WATCHER V3.1 | SR envoyée trop longtemps, on garde la queue mais on ne réinjecte pas : " + sentVideoId);
        return true;
    } else {
        logger.info("WATCHER V3.1 | SR déjà envoyée en attente : " + sentVideoId);
        return true;
    }
}

        if (!(await cooldownOk(vars))) {
            logger.info("WATCHER V3.1 | Cooldown actif.");
            return true;
        }

        const song = getNextValidSong(queue);

        if (!song || !song.videoId) {
            queue = removeInvalidSongs(queue);
            await setVar(vars, QUEUE_KEY, JSON.stringify(queue));
            return true;
        }

        const videoId = song.videoId;
        const title = song.title || "Musique inconnue";
        const user = song.user || "Viewer";

        const noRealPlayback =
            !currentVideoId ||
            elapsed <= 1 ||
            paused;

        let sent = false;

        if (noRealPlayback) {
            logger.info("WATCHER V3.1 | Aucun vrai playback, insertion FRONT + wake.");

            sent = await sendToYTMQueue(host, port, videoId, "INSERT_AT_FRONT", logger);

            if (sent) {
                await tryWakePlayer(host, port, logger);
            }
        } else {
            logger.info("WATCHER V3.1 | Current réel détecté, insertion AFTER_CURRENT.");

            sent = await sendToYTMAfterCurrent(host, port, videoId, logger);
        }

        if (!sent) {
            logger.info("WATCHER V3.1 | YTM refuse la SR : " + title);

            queue = removeSongFromQueue(queue, videoId);
            await setVar(vars, QUEUE_KEY, JSON.stringify(queue));
            await setVar(vars, "ytm_sr_last_message_godas", `⚠️ SR refusée par YTM : ${title}`);

            return true;
        }

        // IMPORTANT : on ne retire PAS la SR ici.
        // Elle reste en queue locale tant qu'elle n'est pas réellement devenue current.
        await setVar(vars, SENT_KEY, videoId);
        await setVar(vars, SENT_SINCE_KEY, Date.now().toString());
        await setVar(vars, LAST_LAUNCH_KEY, Date.now().toString());

        await clearOldWaitingVars(vars);

        await setVar(vars, "ytm_current_song_title_godas", title);
        await setVar(vars, "ytm_current_song_user_godas", user);
        await setVar(vars, "ytm_current_song_url_godas", "https://music.youtube.com/watch?v=" + videoId);
        await setVar(vars, "ytm_sr_last_message_godas", `🎶 SR placée : ${title} demandée par ${user}`);

        logger.info("WATCHER V3.1 | SR envoyée à YTM : " + title);

        return true;
    } catch (err) {
        logger.error("WATCHER V3.1 ERROR : " + err.stack);
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

async function clearOldWaitingVars(vars) {
    await setVar(vars, "ytm_sr_waiting_videoid_godas", "");
    await setVar(vars, "ytm_sr_waiting_since_godas", "");
    await setVar(vars, "ytm_sr_waiting_retry_godas", "");
    await setVar(vars, "ytm_sr_last_requeue_current_godas", "");
    await setVar(vars, "ytm_sr_waiting_priority_godas", "");
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

async function getQueue(vars, logger) {
    const queue = await getVar(vars, QUEUE_KEY);

    if (Array.isArray(queue)) return queue;

    try {
        return JSON.parse(queue || "[]");
    } catch {
        logger.info("WATCHER V3.1 | Queue JSON invalide : " + queue);
        return [];
    }
}

async function getCurrentSong(host, port) {
    const endpoints = [
        "/api/v1/song",
        "/api/v1/current-song",
        "/api/v1/player"
    ];

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(`http://${host}:${port}${endpoint}`);

            if (!response.ok) continue;

            const body = await response.text();

            if (body && body.trim() !== "") {
                return JSON.parse(body);
            }
        } catch {}
    }

    return null;
}

async function setCurrentFromYtm(vars, currentSong) {
    if (!currentSong) return;

    const videoId = getCurrentVideoId(currentSong);
    const title = getCurrentTitle(currentSong);
    const artist = getCurrentArtist(currentSong);

    if (videoId) {
        await setVar(vars, "ytm_nowplaying_videoid_godas", videoId);
        await setVar(vars, "ytm_nowplaying_url_godas", "https://music.youtube.com/watch?v=" + videoId);
    }

    if (title) {
        await setVar(vars, "ytm_nowplaying_title_godas", title);
    }

    if (artist) {
        await setVar(vars, "ytm_nowplaying_artist_godas", artist);
    }
}

function getCurrentVideoId(json) {
    const paths = [
        ["videoId"],
        ["videoID"],
        ["id"],
        ["video", "id"],
        ["video", "videoId"],
        ["song", "videoId"],
        ["song", "id"],
        ["track", "videoId"],
        ["track", "id"],
        ["player", "videoId"]
    ];

    for (const path of paths) {
        const value = getNested(json, path);

        if (value) return value.toString();
    }

    return "";
}

function getCurrentTitle(json) {
    const paths = [
        ["title"],
        ["name"],
        ["song"],
        ["song", "title"],
        ["track", "title"],
        ["video", "title"],
        ["player", "title"]
    ];

    for (const path of paths) {
        const value = getNested(json, path);

        if (value) return value.toString();
    }

    return "";
}

function getCurrentArtist(json) {
    const paths = [
        ["artist"],
        ["author"],
        ["channel"],
        ["song", "artist"],
        ["track", "artist"],
        ["video", "artist"],
        ["player", "artist"]
    ];

    for (const path of paths) {
        const value = getNested(json, path);

        if (value) return value.toString();
    }

    return "";
}

function getNested(obj, path) {
    let current = obj;

    for (const key of path) {
        if (!current || current[key] === undefined || current[key] === null) {
            return "";
        }

        current = current[key];
    }

    return current;
}

function getNumber(obj, path) {
    const value = getNested(obj, path);
    const parsed = parseInt(value, 10);

    return Number.isNaN(parsed) ? 0 : parsed;
}

function getBool(obj, path) {
    const value = getNested(obj, path);

    if (typeof value === "boolean") return value;

    return value === "true";
}

function getNextValidSong(queue) {
    queue = removeInvalidSongs(queue);

    for (const song of queue) {
        if (song && isPriority(song)) return song;
    }

    return queue[0] || null;
}

function isPriority(song) {
    if (!song) return false;

    return song.priority === true || song.priority === "true";
}

function removeSongFromQueue(queue, videoId) {
    if (!Array.isArray(queue)) return [];

    let removed = false;

    return queue.filter((song) => {
        if (!song || !song.videoId) return false;

        if (!removed && song.videoId === videoId) {
            removed = true;
            return false;
        }

        return true;
    });
}

function removeInvalidSongs(queue) {
    if (!Array.isArray(queue)) return [];

    return queue.filter(song => song && song.videoId);
}

async function cooldownOk(vars) {
    const lastStr = await getVar(vars, LAST_LAUNCH_KEY);

    if (!lastStr) return true;

    const last = parseInt(lastStr, 10);

    if (Number.isNaN(last)) return true;

    return Date.now() - last >= COOLDOWN_MS;
}

async function sentTimedOut(vars) {
    const sinceStr = await getVar(vars, SENT_SINCE_KEY);

    if (!sinceStr) {
        await setVar(vars, SENT_SINCE_KEY, Date.now().toString());
        return false;
    }

    const since = parseInt(sinceStr, 10);

    if (Number.isNaN(since)) {
        await setVar(vars, SENT_SINCE_KEY, Date.now().toString());
        return false;
    }

    return Date.now() - since >= SENT_TIMEOUT_MS;
}

async function stuckTimedOut(vars, videoId) {
    const stuckVideo = (await getVar(vars, STUCK_VIDEO_KEY)) || "";
    const sinceStr = (await getVar(vars, STUCK_SINCE_KEY)) || "";

    if (stuckVideo !== videoId || !sinceStr) {
        await setVar(vars, STUCK_VIDEO_KEY, videoId);
        await setVar(vars, STUCK_SINCE_KEY, Date.now().toString());
        return false;
    }

    const since = parseInt(sinceStr, 10);

    if (Number.isNaN(since)) {
        await setVar(vars, STUCK_SINCE_KEY, Date.now().toString());
        return false;
    }

    return Date.now() - since >= STUCK_TIMEOUT_MS;
}

async function sendToYTMAfterCurrent(host, port, videoId, logger) {
    return sendToYTMQueue(host, port, videoId, "INSERT_AFTER_CURRENT_VIDEO", logger);
}

async function sendToYTMQueue(host, port, videoId, insertPosition, logger) {
    const payload = {
        videoId,
        insertPosition
    };

    try {
        const response = await fetch(`http://${host}:${port}/api/v1/queue`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const body = await response.text();

        if (!response.ok) {
            logger.info("YTM POST FAIL | " + JSON.stringify(payload) + " | " + body);
            return false;
        }

        logger.info("YTM POST OK | " + JSON.stringify(payload));
        return true;
    } catch (err) {
        logger.info("YTM POST FAIL | " + JSON.stringify(payload) + " | " + err.message);
        return false;
    }
}

async function tryWakePlayer(host, port, logger) {
    const endpoints = [
        "/api/v1/play",
        "/api/v1/player/play",
        "/api/v1/toggle-play"
    ];

    for (const endpoint of endpoints) {
        if (await tryPost(host, port, endpoint, {}, logger)) {
            logger.info("WATCHER V3.1 | Wake player OK : " + endpoint);
            return true;
        }
    }

    logger.info("WATCHER V3.1 | Wake player impossible.");
    return false;
}

async function trySkipPlayer(host, port, logger) {
    const beforeSong = await getCurrentSong(host, port);
    const before = getCurrentVideoId(beforeSong);

    logger.info("WATCHER V3.1 | Skip demandé | Before=" + before);

    await tryPost(host, port, "/api/v1/next", {}, logger);
    await sleep(1200);

    let afterSong = await getCurrentSong(host, port);
    let after = getCurrentVideoId(afterSong);

    logger.info("WATCHER V3.1 | Après skip -> Current=" + after);

    if (after === before) {
        logger.info("WATCHER V3.1 | Skip bloqué, hard wake player.");

        await tryPost(host, port, "/api/v1/pause", {}, logger);
        await sleep(500);

        await tryPost(host, port, "/api/v1/play", {}, logger);
        await sleep(1500);

        afterSong = await getCurrentSong(host, port);
        after = getCurrentVideoId(afterSong);

        logger.info("WATCHER V3.1 | Après hard wake -> Current=" + after);

        if (after === before) {
            logger.info("WATCHER V3.1 | Hard wake échoué.");
            return false;
        }
    }

    return true;
}

async function tryPost(host, port, endpoint, payload, logger) {
    try {
        const response = await fetch(`http://${host}:${port}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload || {})
        });

        const body = await response.text();

        if (!response.ok) {
            logger.info("YTM POST FAIL | " + endpoint + " | " + body);
            return false;
        }

        return true;
    } catch (err) {
        logger.info("YTM POST FAIL | " + endpoint + " | " + err.message);
        return false;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}