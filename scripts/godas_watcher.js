const fs = require("fs");
const path = require("path");

exports.getScriptManifest = () => ({
    name: "GODAS YTM V3 - Watcher",
    description: "Watcher YTM GODAS",
    author: "Godas DEV",
    version: "2.0.0",
    firebotVersion: "5"
});

exports.getDefaultParameters = () => Promise.resolve({});

exports.run = async (runRequest) => {
    const logger = runRequest.modules.logger;
    const vars = runRequest.modules.customVariableManager;

    try {
        const config = loadConfig();

        const host = config?.ytmHost || "127.0.0.1";
        const port = config?.ytmPort || "26538";

        const lockState = await getVar(vars, "ytm_sr_lock_godas") || "false";

        if (lockState === "true") {
            return true;
        }

        const currentSong = await getCurrentSong(host, port);
        const currentVideoId = currentSong ? getCurrentVideoId(currentSong) : "";

        const waitingVideoId = await getVar(vars, "ytm_sr_waiting_videoid_godas") || "";
        let queue = await getQueue(vars, logger);

        if (waitingVideoId) {
            if (currentVideoId === waitingVideoId) {
                await setVar(vars, "ytm_sr_waiting_videoid_godas", "");
                await setVar(vars, "ytm_sr_active_videoid_godas", waitingVideoId);

                await setCurrentFromYtm(vars, currentSong);

                logger.info("WATCHER V3 | SR démarrée : " + waitingVideoId);

                return true;
            }

            return true;
        }

        if (queue.length === 0) {
            await setCurrentFromYtm(vars, currentSong);
            return true;
        }

        if (!(await cooldownOk(vars))) {
            return true;
        }

        const song = getNextSong(queue);

        if (!song || !song.videoId) {
            return true;
        }

        const videoId = song.videoId;
        const title = song.title || "Musique inconnue";
        const user = song.user || "Viewer";

        const sent = await sendToYTMAfterCurrent(host, port, videoId, logger);

        if (!sent) {
            logger.info("WATCHER V3 | Impossible d'ajouter dans YTM : " + title);
            return true;
        }

        queue = removeSongFromQueue(queue, videoId);

        await setVar(vars, "ytm_sr_queue_godas", JSON.stringify(queue));
        await setVar(vars, "ytm_sr_waiting_videoid_godas", videoId);
        await setVar(vars, "ytm_sr_waiting_priority_godas", isPriority(song) ? "true" : "false");
        await setVar(vars, "ytm_sr_last_launch_ticks_godas", Date.now().toString());

        await setVar(vars, "ytm_current_song_title_godas", title);
        await setVar(vars, "ytm_current_song_user_godas", user);
        await setVar(vars, "ytm_current_song_url_godas", "https://music.youtube.com/watch?v=" + videoId);

        await setVar(
            vars,
            "ytm_sr_last_message_godas",
            `🎶 SR placée après la musique actuelle : ${title} demandée par ${user}`
        );

        logger.info("WATCHER V3 | SR placée en attente : " + title);

        return true;
    } catch (err) {
        logger.error("WATCHER V3 ERROR : " + err.stack);
        return false;
    }
};

function loadConfig() {
    const configPath = path.join(__dirname, "godas_ytm_config.json");

    if (!fs.existsSync(configPath)) {
        return null;
    }

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

async function getQueue(vars, logger) {
    let queue = await getVar(vars, "ytm_sr_queue_godas");

    if (Array.isArray(queue)) {
        return queue;
    }

    try {
        return JSON.parse(queue || "[]");
    } catch {
        logger.info("WATCHER V3 | Queue JSON invalide : " + queue);
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

function getNextSong(queue) {
    for (const song of queue) {
        if (isPriority(song)) {
            return song;
        }
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

async function cooldownOk(vars) {
    const lastStr = await getVar(vars, "ytm_sr_last_launch_ticks_godas");

    if (!lastStr) return true;

    const last = parseInt(lastStr, 10);

    if (isNaN(last)) return true;

    return Date.now() - last >= 2000;
}

async function sendToYTMAfterCurrent(host, port, videoId, logger) {
    const url = `http://${host}:${port}/api/v1/queue`;

    const payload = {
        videoId: videoId,
        insertPosition: "INSERT_AFTER_CURRENT_VIDEO"
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

        logger.info("YTM POST OK | " + videoId);
        return true;
    } catch (err) {
        logger.info("YTM POST FAIL | " + JSON.stringify(payload) + " | " + err.message);
        return false;
    }
}