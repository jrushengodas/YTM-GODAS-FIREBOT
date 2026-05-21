const fs = require("fs");
const path = require("path");

exports.getScriptManifest = () => ({
    name: "GODAS YTM V3.1 - Song",
    description: "Affiche la musique actuelle YTM",
    author: "Godas DEV",
    version: "3.1.0",
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

        const song = await getCurrentSong(host, port);

        if (!song) {
            await setVar(vars, "ytm_sr_last_message_godas", "🎵 Aucune musique actuellement détectée.");
            return true;
        }

        const title = getCurrentTitle(song);
        const artist = getCurrentArtist(song);
        const videoId = getCurrentVideoId(song);

        logger.info(
            `SONG V3.1 | title=${title} | artist=${artist} | videoId=${videoId}`
        );

        if (!title) {
            await setVar(vars, "ytm_sr_last_message_godas", "🎵 Aucune musique actuellement détectée.");
            return true;
        }

        await setVar(vars, "ytm_nowplaying_title_godas", title);
        await setVar(vars, "ytm_nowplaying_artist_godas", artist);
        await setVar(vars, "ytm_nowplaying_videoid_godas", videoId);

        if (videoId) {
            await setVar(vars, "ytm_nowplaying_url_godas", "https://music.youtube.com/watch?v=" + videoId);
        } else {
            await setVar(vars, "ytm_nowplaying_url_godas", "");
        }

        const music = artist ? `${artist} - ${title}` : title;

        const srVideoId = await getVar(vars, "ytm_sr_active_videoid_godas");
        const srUser = await getVar(vars, "ytm_current_song_user_godas");

        const isSongRequest =
            videoId &&
            srVideoId &&
            videoId === srVideoId;

        if (isSongRequest && srUser) {
            await setVar(
                vars,
                "ytm_sr_last_message_godas",
                `🎵 Musique actuelle : ${music} | demandée par ${srUser}`
            );
        } else {
            await setVar(
                vars,
                "ytm_sr_last_message_godas",
                `🎵 Musique actuelle : ${music}`
            );
        }

        return true;
    } catch (err) {
        logger.error("Erreur commande song : " + err.stack);

        await setVar(
            runRequest.modules.customVariableManager,
            "ytm_sr_last_message_godas",
            "❌ Erreur commande song."
        );

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

async function getCurrentSong(host, port) {
    const endpoints = [
        "/api/v1/song",
        "/api/v1/current-song",
        "/api/v1/player"
    ];

    for (const endpoint of endpoints) {
        try {
            const body = await httpGetText(`http://${host}:${port}${endpoint}`);

            if (body && body.trim() !== "") {
                return JSON.parse(body);
            }
        } catch {}
    }

    return null;
}

function httpGetText(url) {
    return fetch(url).then(async (response) => {
        const body = await response.text();

        if (!response.ok) {
            throw new Error("HTTP " + response.status + " : " + body);
        }

        return body;
    });
}

function getCurrentTitle(json) {
    const paths = [
        ["title"],
        ["name"],
        ["song"],
        ["song", "title"],
        ["track", "title"],
        ["video", "title"],
        ["player", "title"],
        ["media", "title"]
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
        ["song", "author"],
        ["track", "artist"],
        ["track", "author"],
        ["video", "artist"],
        ["video", "author"],
        ["player", "artist"],
        ["media", "artist"]
    ];

    for (const path of paths) {
        const value = getNested(json, path);

        if (value) return value.toString();
    }

    return "";
}

function getCurrentVideoId(json) {
    const paths = [
        ["videoId"],
        ["videoID"],
        ["id"],
        ["song", "videoId"],
        ["song", "id"],
        ["track", "videoId"],
        ["track", "id"],
        ["video", "videoId"],
        ["video", "id"],
        ["player", "videoId"],
        ["media", "videoId"]
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
