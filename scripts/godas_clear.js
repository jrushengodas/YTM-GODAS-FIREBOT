const fs = require("fs");
const path = require("path");

exports.getScriptManifest = () => ({
    name: "GODAS YTM V3 - Clear",
    description: "Vide la queue YTM + variables SR",
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

        await clearYTMQueue(host, port, logger);
        await clearVars(vars);

        await setVar(vars, "ytm_sr_last_message_godas", "🧹 Clear effectué.");

        return true;
    } catch (err) {
        logger.error("Erreur clear V3 : " + err.stack);

        await setVar(
            runRequest.modules.customVariableManager,
            "ytm_sr_last_message_godas",
            "❌ Erreur lors du clear."
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

async function clearYTMQueue(host, port, logger) {
    const base = `http://${host}:${port}`;

    if (await tryDelete(`${base}/api/v1/queue`, logger)) {
        logger.info("CLEAR V3 | Queue YTM vidée via DELETE /api/v1/queue");
        return;
    }

    for (let i = 0; i < 100; i++) {
        const deleted = await tryDelete(`${base}/api/v1/queue/1`, logger);

        if (!deleted) break;
    }

    logger.info("CLEAR V3 | Queue YTM vidée via fallback /queue/1");
}

async function tryDelete(url, logger) {
    try {
        const response = await fetch(url, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            }
        });

        return response.ok;
    } catch (err) {
        logger.info("DELETE fail : " + url + " | " + err.message);
        return false;
    }
}

async function clearVars(vars) {
    await setVar(vars, "ytm_sr_queue_godas", "[]");
    await setVar(vars, "ytm_sr_history_godas", "[]");
    await setVar(vars, "ytm_sr_played_history_godas", "[]");
    await setVar(vars, "ytm_sr_added_count_godas", "0");

    await setVar(vars, "ytm_sr_active_videoid_godas", "");
    await setVar(vars, "ytm_sr_waiting_videoid_godas", "");
    await setVar(vars, "ytm_sr_last_launch_ticks_godas", "");

    await setVar(vars, "ytm_current_song_title_godas", "");
    await setVar(vars, "ytm_current_song_user_godas", "");
    await setVar(vars, "ytm_current_song_url_godas", "");

    await setVar(vars, "ytm_watcher_last_videoid_godas", "");
    await setVar(vars, "ytm_watcher_last_title_godas", "");
    await setVar(vars, "ytm_sr_waiting_priority_godas", "");
    await setVar(vars, "ytm_sr_lock_godas", "false");
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
