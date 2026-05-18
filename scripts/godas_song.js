const fs = require("fs");
const path = require("path");

exports.getScriptManifest = () => ({
    name: "GODAS YTM V3 - Song",
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

        const body = await httpGetText(`http://${host}:${port}/api/v1/song`);

        if (!body || body.trim() === "") {
            await setVar(vars, "ytm_sr_last_message_godas", "🎵 Aucune musique actuellement détectée.");
            return true;
        }

        const song = JSON.parse(body);

        const title =
            song.title ||
            song.name ||
            song.song ||
            "";

        const artist =
            song.artist ||
            song.author ||
            song.channel ||
            "";

        const videoId =
            song.videoId ||
            song.videoID ||
            song.id ||
            "";

        if (!title) {
            await setVar(vars, "ytm_sr_last_message_godas", "🎵 Aucune musique actuellement détectée.");
            return true;
        }

        await setVar(vars, "ytm_nowplaying_title_godas", title);
        await setVar(vars, "ytm_nowplaying_artist_godas", artist);
        await setVar(vars, "ytm_nowplaying_videoid_godas", videoId);

        if (videoId) {
            await setVar(vars, "ytm_nowplaying_url_godas", "https://music.youtube.com/watch?v=" + videoId);
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

function httpGetText(url) {
    return fetch(url).then(async (response) => {
        const body = await response.text();

        if (!response.ok) {
            throw new Error("HTTP " + response.status + " : " + body);
        }

        return body;
    });
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
