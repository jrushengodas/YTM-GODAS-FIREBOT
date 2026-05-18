const fs = require("fs");
const path = require("path");

exports.getScriptManifest = () => ({
    name: "GODAS YTM V3.1 - Watcher",
    description: "Watcher YTM GODAS V3.1",
    author: "Godas DEV",
    version: "3.1.0",
    firebotVersion: "5"
});

exports.getDefaultParameters = () => Promise.resolve({});

const WAITING_TIMEOUT_MS = 25000;
const STUCK_TIMEOUT_MS = 25000;

exports.run = async (runRequest) => {
    const logger = runRequest.modules.logger;
    const vars = runRequest.modules.customVariableManager;

    try {
        logger.info("WATCHER V3.1 | Start");

        const config = loadConfig();
        const host = config?.ytmHost || "127.0.0.1";
        const port = config?.ytmPort || "26538";

        const lockState = (await getVar(vars, "ytm_sr_lock_godas")) || "false";

        if (lockState === "true") {
            logger.info("WATCHER V3.1 | Lock actif.");
            return true;
        }

        const currentSong = await getCurrentSong(host, port);
        const currentVideoId = currentSong ? getCurrentVideoId(currentSong) : "";

        const waitingVideoId = (await getVar(vars, "ytm_sr_waiting_videoid_godas")) || "";
        const lastCurrentVideoId = (await getVar(vars, "ytm_sr_last_current_videoid_godas")) || "";
        const lastRequeueCurrent = (await getVar(vars, "ytm_sr_last_requeue_current_godas")) || "";

        let queue = await getQueue(vars, logger);

        logger.info(`WATCHER V3.1 | Current=${currentVideoId} | Waiting=${waitingVideoId} | Queue=${queue.length}`);

        if (
            waitingVideoId &&
            currentVideoId &&
            lastCurrentVideoId &&
            currentVideoId !== lastCurrentVideoId &&
            currentVideoId !== waitingVideoId &&
            lastRequeueCurrent !== currentVideoId
        ) {
            logger.info("WATCHER V3.1 | Current changé, requeue waiting après le nouveau current.");

            const resent = await sendToYTMAfterCurrent(host, port, waitingVideoId, logger);

            if (resent) {
                await setVar(vars, "ytm_sr_waiting_since_godas", Date.now().toString());
                await setVar(vars, "ytm_sr_waiting_retry_godas", "requeue_current_change");
                await setVar(vars, "ytm_sr_last_requeue_current_godas", currentVideoId);
                logger.info("WATCHER V3.1 | Waiting réinjecté après nouveau current.");
            }
        }

        if (currentVideoId) {
            await setVar(vars, "ytm_sr_last_current_videoid_godas", currentVideoId);
        }

        if (waitingVideoId) {
            if (currentVideoId === waitingVideoId) {
                const elapsed = getNumber(currentSong, ["elapsedSeconds"]);
                const duration = getNumber(currentSong, ["songDuration"]);
                const isPaused = getBool(currentSong, ["isPaused"]);

                logger.info(`WATCHER V3.1 | Current=Waiting | elapsed=${elapsed} | duration=${duration} | paused=${isPaused}`);

                if (elapsed > 3) {
                    await setVar(vars, "ytm_sr_waiting_videoid_godas", "");
                    await setVar(vars, "ytm_sr_waiting_since_godas", "");
                    await setVar(vars, "ytm_sr_waiting_retry_godas", "");
                    await setVar(vars, "ytm_sr_last_requeue_current_godas", "");
                    await setVar(vars, "ytm_sr_stuck_videoid_godas", "");
                    await setVar(vars, "ytm_sr_stuck_since_godas", "");
                    await setVar(vars, "ytm_sr_active_videoid_godas", waitingVideoId);

                    await setCurrentFromYtm(vars, currentSong);

                    logger.info("WATCHER V3.1 | SR démarrée proprement : " + waitingVideoId);
                    return true;
                }

                if (duration > 0 && elapsed === 0 && !isPaused) {
                    if (await currentStuckTimedOut(vars, waitingVideoId)) {
                        logger.info("WATCHER V3.1 | SR bloquée à 0:00, skip : " + waitingVideoId);

                        await trySkipPlayer(host, port, logger);
                        await markWaitingCacheInvalid(vars, waitingVideoId, "stuck_at_zero", logger);
                        await clearWaiting(vars);

                        await setVar(vars, "ytm_sr_last_message_godas", "SR bloquée à 0:00, je la skip.");
                        return true;
                    }

                    logger.info("WATCHER V3.1 | SR current mais bloquée à 0, surveillance.");
                    return true;
                }

                return true;
            }

            if (await waitingTimedOut(vars)) {
                const retryState = (await getVar(vars, "ytm_sr_waiting_retry_godas")) || "";

                if (retryState === "") {
                    logger.info("WATCHER V3.1 | Waiting trop long, tentative next pour lancer la SR.");

                    await trySkipPlayer(host, port, logger);
                    await setVar(vars, "ytm_sr_waiting_since_godas", Date.now().toString());
                    await setVar(vars, "ytm_sr_waiting_retry_godas", "skip_next");
                    return true;
                }

                if (retryState === "skip_next" || retryState === "requeue_current_change") {
                    logger.info("WATCHER V3.1 | Waiting toujours non lancé, requeue après current.");

                    const resent = currentVideoId
                        ? await sendToYTMAfterCurrent(host, port, waitingVideoId, logger)
                        : await sendToYTMEnd(host, port, waitingVideoId, logger);

                    if (resent) {
                        await tryWakePlayer(host, port, logger);
                        await setVar(vars, "ytm_sr_waiting_since_godas", Date.now().toString());
                        await setVar(vars, "ytm_sr_waiting_retry_godas", "requeue_after_timeout");
                        logger.info("WATCHER V3.1 | Waiting réinjecté après timeout.");
                        return true;
                    }
                }

                logger.info("WATCHER V3.1 | SR impossible à lancer après retry, skip : " + waitingVideoId);

                await trySkipPlayer(host, port, logger);
                await markWaitingCacheInvalid(vars, waitingVideoId, "waiting_timeout_after_retry", logger);
                await clearWaiting(vars);

                await setVar(vars, "ytm_sr_last_message_godas", "SR impossible à lancer, je passe à la suite.");
                return true;
            }

            logger.info("WATCHER V3.1 | Waiting présent, pas encore timeout.");
            return true;
        }

        if (queue.length === 0) {
            await setCurrentFromYtm(vars, currentSong);
            return true;
        }

        if (!(await cooldownOk(vars))) {
            logger.info("WATCHER V3.1 | Cooldown actif.");
            return true;
        }

        const song = getNextSong(queue);

        if (!song || !song.videoId) {
            queue = removeInvalidSongs(queue);
            await setVar(vars, "ytm_sr_queue_godas", JSON.stringify(queue));
            return true;
        }

        const videoId = song.videoId;
        const title = song.title || "Musique inconnue";
        const user = song.user || "Viewer";

        let sent;

        if (!currentVideoId) {
            logger.info("WATCHER V3.1 | Aucun current, insertion fin de queue.");
            sent = await sendToYTMEnd(host, port, videoId, logger);

            if (sent) {
                await tryWakePlayer(host, port, logger);
            }
        } else {
            logger.info("WATCHER V3.1 | Current détecté, insertion après current.");
            sent = await sendToYTMAfterCurrent(host, port, videoId, logger);
        }

        if (!sent) {
            logger.info("WATCHER V3.1 | YTM refuse la SR, skip : " + title);

            await markSongCacheInvalid(vars, song, "ytm_post_fail", logger);

            queue = removeSongFromQueue(queue, videoId);
            await setVar(vars, "ytm_sr_queue_godas", JSON.stringify(queue));

            await setVar(vars, "ytm_sr_last_message_godas", `SR refusée par YTM : ${title}`);
            return true;
        }

        queue = removeSongFromQueue(queue, videoId);

        await setVar(vars, "ytm_sr_queue_godas", JSON.stringify(queue));
        await setVar(vars, "ytm_sr_waiting_videoid_godas", videoId);
        await setVar(vars, "ytm_sr_waiting_since_godas", Date.now().toString());
        await setVar(vars, "ytm_sr_waiting_retry_godas", "");
        await setVar(vars, "ytm_sr_last_requeue_current_godas", "");
        await setVar(vars, "ytm_sr_stuck_videoid_godas", "");
        await setVar(vars, "ytm_sr_stuck_since_godas", "");
        await setVar(vars, "ytm_sr_waiting_priority_godas", isPriority(song) ? "true" : "false");
        await setVar(vars, "ytm_sr_last_launch_ticks_godas", Date.now().toString());

        await setVar(vars, "ytm_current_song_title_godas", title);
        await setVar(vars, "ytm_current_song_user_godas", user);
        await setVar(vars, "ytm_current_song_url_godas", "https://music.youtube.com/watch?v=" + videoId);

        await setVar(vars, "ytm_sr_last_message_godas", `SR placée : ${title} demandée par ${user}`);

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

async function clearWaiting(vars) {
    await setVar(vars, "ytm_sr_waiting_videoid_godas", "");
    await setVar(vars, "ytm_sr_waiting_since_godas", "");
    await setVar(vars, "ytm_sr_waiting_retry_godas", "");
    await setVar(vars, "ytm_sr_last_requeue_current_godas", "");
    await setVar(vars, "ytm_sr_stuck_videoid_godas", "");
    await setVar(vars, "ytm_sr_stuck_since_godas", "");
    await setVar(vars, "ytm_sr_active_videoid_godas", "");
}

async function getQueue(vars, logger) {
    let queue = await getVar(vars, "ytm_sr_queue_godas");

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
            const url = `http://${host}:${port}${endpoint}`;
            const response = await fetch(url);

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

    if (videoId) {
        await setVar(vars, "ytm_current_song_url_godas", "https://music.youtube.com/watch?v=" + videoId);
    }

    if (title) {
        await setVar(vars, "ytm_current_song_title_godas", title);
    }
}

function getCurrentVideoId(json) {
    const paths = [
        ["videoId"],
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

function getNextSong(queue) {
    for (const song of queue) {
        if (isPriority(song)) return song;
    }

    return queue[0] || null;
}

function isPriority(song) {
    if (!song) return false;
    return song.priority === true || song.priority === "true";
}

function removeSongFromQueue(queue, videoId) {
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
    return queue.filter((song) => song && song.videoId);
}

async function cooldownOk(vars) {
    const lastStr = await getVar(vars, "ytm_sr_last_launch_ticks_godas");

    if (!lastStr) return true;

    const last = parseInt(lastStr, 10);

    if (Number.isNaN(last)) return true;

    return Date.now() - last >= 2000;
}

async function waitingTimedOut(vars) {
    const sinceStr = await getVar(vars, "ytm_sr_waiting_since_godas");

    if (!sinceStr) {
        await setVar(vars, "ytm_sr_waiting_since_godas", Date.now().toString());
        return false;
    }

    const since = parseInt(sinceStr, 10);

    if (Number.isNaN(since)) {
        await setVar(vars, "ytm_sr_waiting_since_godas", Date.now().toString());
        return false;
    }

    return Date.now() - since >= WAITING_TIMEOUT_MS;
}

async function currentStuckTimedOut(vars, videoId) {
    const stuckVideo = await getVar(vars, "ytm_sr_stuck_videoid_godas");
    const sinceStr = await getVar(vars, "ytm_sr_stuck_since_godas");

    if (stuckVideo !== videoId || !sinceStr) {
        await setVar(vars, "ytm_sr_stuck_videoid_godas", videoId);
        await setVar(vars, "ytm_sr_stuck_since_godas", Date.now().toString());
        return false;
    }

    const since = parseInt(sinceStr, 10);

    if (Number.isNaN(since)) {
        await setVar(vars, "ytm_sr_stuck_since_godas", Date.now().toString());
        return false;
    }

    return Date.now() - since >= STUCK_TIMEOUT_MS;
}

async function sendToYTMAfterCurrent(host, port, videoId, logger) {
    return sendToYTMQueue(host, port, videoId, "INSERT_AFTER_CURRENT_VIDEO", logger);
}

async function sendToYTMEnd(host, port, videoId, logger) {
    return sendToYTMQueue(host, port, videoId, "INSERT_AT_END", logger);
}

async function sendToYTMQueue(host, port, videoId, insertPosition, logger) {
    const url = `http://${host}:${port}/api/v1/queue`;

    const payload = {
        videoId,
        insertPosition
    };

    try {
        const response = await fetch(url, {
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
    const endpoints = [
        "/api/v1/next",
        "/api/v1/player/next",
        "/api/v1/skip"
    ];

    for (const endpoint of endpoints) {
        if (await tryPost(host, port, endpoint, {}, logger)) {
            logger.info("WATCHER V3.1 | Skip player OK : " + endpoint);
            return true;
        }
    }

    logger.info("WATCHER V3.1 | Aucun endpoint skip OK.");
    return false;
}

async function tryPost(host, port, endpoint, payload, logger) {
    const url = `http://${host}:${port}${endpoint}`;

    try {
        const response = await fetch(url, {
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

async function markWaitingCacheInvalid(vars, videoId, reason, logger) {
    const json = await getVar(vars, "ytm_sr_cache_godas");

    if (!json) return;

    let cache;

    try {
        cache = typeof json === "object" ? json : JSON.parse(json);
    } catch {
        return;
    }

    for (const key of Object.keys(cache)) {
        const item = cache[key];

        if (!item || item.videoId !== videoId) continue;

        item.valid = false;
        item.lastFailReason = reason;
        item.lastFailAt = new Date().toISOString();
        item.failCount = (parseInt(item.failCount || 0, 10) || 0) + 1;

        await setVar(vars, "ytm_sr_cache_godas", JSON.stringify(cache));
        logger.info("WATCHER V3.1 | Cache invalidé : " + key + " | " + reason);
        return;
    }
}

async function markSongCacheInvalid(vars, song, reason, logger) {
    if (!song) return;

    const json = await getVar(vars, "ytm_sr_cache_godas");

    if (!json) return;

    let cache;

    try {
        cache = typeof json === "object" ? json : JSON.parse(json);
    } catch {
        return;
    }

    let key = song.cacheKey || "";

    if (key && cache[key]) {
        cache[key].valid = false;
        cache[key].lastFailReason = reason;
        cache[key].lastFailAt = new Date().toISOString();
        cache[key].failCount = (parseInt(cache[key].failCount || 0, 10) || 0) + 1;

        await setVar(vars, "ytm_sr_cache_godas", JSON.stringify(cache));
        logger.info("WATCHER V3.1 | Cache invalidé : " + key + " | " + reason);
        return;
    }

    const videoId = song.videoId || "";

    for (const cacheKey of Object.keys(cache)) {
        const item = cache[cacheKey];

        if (!item || item.videoId !== videoId) continue;

        item.valid = false;
        item.lastFailReason = reason;
        item.lastFailAt = new Date().toISOString();
        item.failCount = (parseInt(item.failCount || 0, 10) || 0) + 1;

        await setVar(vars, "ytm_sr_cache_godas", JSON.stringify(cache));
        logger.info("WATCHER V3.1 | Cache invalidé : " + cacheKey + " | " + reason);
        return;
    }
}
