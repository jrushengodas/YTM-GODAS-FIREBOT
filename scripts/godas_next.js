const fs = require("fs");
const path = require("path");

exports.getScriptManifest = () => ({
    name: "GODAS YTM V3 - Next",
    description: "Affiche la prochaine musique YTM",
    author: "Godas DEV",
    version: "1.0.1",
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

        const body = await httpGetText(`http://${host}:${port}/api/v1/queue`);
        const parsed = JSON.parse(body);

        const items = parsed.items || [];

        if (!Array.isArray(items) || items.length === 0) {
            await setVar(vars, "ytm_sr_last_message_godas", "🎵 Aucune musique suivante.");
            return true;
        }

        const renderers = items
            .map(item => getRenderer(item))
            .filter(Boolean);

        if (renderers.length === 0) {
            await setVar(vars, "ytm_sr_last_message_godas", "🎵 Aucune musique suivante.");
            return true;
        }

        const currentIndex = renderers.findIndex(r => r.selected === true);

        let nextRenderer = null;

        if (currentIndex >= 0 && renderers[currentIndex + 1]) {
            nextRenderer = renderers[currentIndex + 1];
        } else if (renderers.length > 1) {
            nextRenderer = renderers[1];
        } else {
            nextRenderer = null;
        }

        if (!nextRenderer) {
            await setVar(vars, "ytm_sr_last_message_godas", "🎵 Aucune musique suivante.");
            return true;
        }

        const title = getFirstRunText(nextRenderer.title) || "Titre inconnu";

        let artist = getFirstRunText(nextRenderer.shortBylineText);

        if (!artist) {
            artist = getFirstRunText(nextRenderer.longBylineText);
        }

        const music = artist ? `${artist} - ${title}` : title;

        await setVar(
            vars,
            "ytm_sr_last_message_godas",
            "⏭️ Prochaine musique : " + music
        );

        return true;

    } catch (err) {
        logger.error("Erreur next : " + err.stack);

        await setVar(
            runRequest.modules.customVariableManager,
            "ytm_sr_last_message_godas",
            "❌ Erreur commande next."
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

function getRenderer(item) {
    if (!item) return null;

    if (item.playlistPanelVideoRenderer) {
        return item.playlistPanelVideoRenderer;
    }

    if (
        item.playlistPanelVideoWrapperRenderer &&
        item.playlistPanelVideoWrapperRenderer.primaryRenderer &&
        item.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer
    ) {
        return item.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer;
    }

    return null;
}

function getFirstRunText(token) {
    if (!token || !Array.isArray(token.runs) || token.runs.length === 0) {
        return "";
    }

    return token.runs[0].text || "";
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