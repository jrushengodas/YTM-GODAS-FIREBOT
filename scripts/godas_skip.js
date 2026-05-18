const fs = require("fs");
const path = require("path");

exports.getScriptManifest = () => ({
    name: "GODAS YTM V3 - Skip",
    description: "Skip la musique actuelle",
    author: "Godas DEV",
    version: "3.1.0",
    firebotVersion: "5"
});

exports.getDefaultParameters = () => Promise.resolve({});

exports.run = async (runRequest) => {
    const logger = runRequest.modules.logger;
    const vars = runRequest.modules.customVariableManager;

    try {
        const redeemer = getUser(runRequest);

        const config = loadConfig();

        const host = config?.ytmHost || "127.0.0.1";
        const port = config?.ytmPort || "26538";

        const currentTitle =
            await getVar(vars, "ytm_current_song_title_godas") || "";

        const currentUser =
            await getVar(vars, "ytm_current_song_user_godas") || "";

        const skipped = await skipCurrentSong(host, port, logger);

        if (!skipped) {
            await setVar(
                vars,
                "ytm_sr_last_message_godas",
                "❌ Impossible de passer la musique actuelle."
            );

            return true;
        }

        let message = "⏭️ ";

        if (redeemer) {
            message += redeemer + " a utilisé le skip";
        }

        if (currentTitle) {
            message += " → " + currentTitle;

            if (currentUser) {
                message += " demandée par " + currentUser;
            }
        }

        await setVar(vars, "ytm_sr_last_message_godas", message);

        await setVar(vars, "ytm_sr_active_videoid_godas", "");
        await setVar(vars, "ytm_current_song_title_godas", "");
        await setVar(vars, "ytm_current_song_user_godas", "");
        await setVar(vars, "ytm_current_song_url_godas", "");

        return true;

    } catch (err) {
        logger.error("Erreur reward skip V3 : " + err.stack);

        await setVar(
            runRequest.modules.customVariableManager,
            "ytm_sr_last_message_godas",
            "❌ Erreur skip."
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

function getUser(runRequest) {
    const metadata = runRequest.trigger?.metadata || {};
    const userCommand = metadata.userCommand || {};
    const chatMessage = metadata.chatMessage || {};

    return (
        metadata.username ||
        metadata.userDisplayName ||
        userCommand.commandSender ||
        chatMessage.userDisplayName ||
        chatMessage.username ||
        "Un viewer"
    );
}

async function skipCurrentSong(host, port, logger) {
    const endpoints = [
        "/api/v1/next",
        "/api/v1/player/next",
        "/api/v1/queue/next-song"
    ];

    for (const endpoint of endpoints) {
        try {
            const url = `http://${host}:${port}${endpoint}`;

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: "{}"
            });

            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }

            logger.info("Skip réussi via : " + endpoint);

            return true;

        } catch (err) {
            logger.info("Erreur endpoint skip " + endpoint + " : " + err.message);
        }
    }

    return false;
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
