const fs = require("fs");
const path = require("path");

exports.getScriptManifest = () => ({
    name: "GODAS YTM V3.1 - Next",
    description: "Affiche la prochaine musique YTM",
    author: "Godas DEV",
    version: "3.1.0",
    firebotVersion: "5"
});

exports.getDefaultParameters = () => Promise.resolve({});

exports.run = async (runRequest) => {
    const logger = runRequest.modules.logger;
    const vars = runRequest.modules.customVariableManager;

    try {
        let queue = await getQueue(vars);

        queue = cleanQueue(queue);
        queue = sortPriorityFirst(queue);

        // PRIORITÉ : queue locale GODAS
        if (queue.length > 0) {
            const nextSong = queue[0];

            const title =
                nextSong.title || "Titre inconnu";

            const user =
                nextSong.user || "inconnu";

            const duration =
                nextSong.durationText || "??:??";

            const priority =
                isPriority(nextSong)
                    ? "[PRIO] "
                    : "";

            const message =
                `⏭️ Prochaine SR : ${priority}${title} (${duration}) — ${user}`;

            await setVar(
                vars,
                "ytm_sr_last_message_godas",
                message
            );

            logger.info(
                "NEXT V3.1 | LOCAL QUEUE | " + message
            );

            return true;
        }

        // FALLBACK YTM
        const config = loadConfig();

        const host =
            config?.ytmHost || "127.0.0.1";

        const port =
            config?.ytmPort || "26538";

        const body = await httpGetText(
            `http://${host}:${port}/api/v1/queue`
        );

        const parsed = JSON.parse(body);

        const items = parsed.items || [];

        if (!Array.isArray(items) || items.length === 0) {
            await setVar(
                vars,
                "ytm_sr_last_message_godas",
                "🎵 Aucune musique suivante."
            );

            return true;
        }

        const renderers = items
            .map(item => getRenderer(item))
            .filter(Boolean);

        if (renderers.length === 0) {
            await setVar(
                vars,
                "ytm_sr_last_message_godas",
                "🎵 Aucune musique suivante."
            );

            return true;
        }

        const currentIndex =
            renderers.findIndex(
                r => r.selected === true
            );

        let nextRenderer = null;

        if (
            currentIndex >= 0 &&
            renderers[currentIndex + 1]
        ) {
            nextRenderer =
                renderers[currentIndex + 1];
        } else if (renderers.length > 1) {
            nextRenderer = renderers[1];
        }

        if (!nextRenderer) {
            await setVar(
                vars,
                "ytm_sr_last_message_godas",
                "🎵 Aucune musique suivante."
            );

            return true;
        }

        const title =
            getFirstRunText(nextRenderer.title) ||
            "Titre inconnu";

        let artist =
            getFirstRunText(
                nextRenderer.shortBylineText
            );

        if (!artist) {
            artist =
                getFirstRunText(
                    nextRenderer.longBylineText
                );
        }

        const music =
            artist
                ? `${artist} - ${title}`
                : title;

        const message =
            "⏭️ Prochaine musique : " + music;

        await setVar(
            vars,
            "ytm_sr_last_message_godas",
            message
        );

        logger.info(
            "NEXT V3.1 | YTM FALLBACK | " + message
        );

        return true;

    } catch (err) {
        logger.error(
            "NEXT V3.1 ERROR : " + err.stack
        );

        await setVar(
            runRequest.modules.customVariableManager,
            "ytm_sr_last_message_godas",
            "❌ Erreur commande next."
        );

        return false;
    }
};

async function getQueue(vars) {
    let queue = await getVar(
        vars,
        "ytm_sr_queue_godas"
    );

    if (Array.isArray(queue)) {
        return queue;
    }

    try {
        return JSON.parse(queue || "[]");
    } catch {
        return [];
    }
}

function cleanQueue(queue) {
    if (!Array.isArray(queue)) {
        return [];
    }

    const clean = [];
    const seen = [];

    for (const song of queue) {
        if (!song || !song.videoId) {
            continue;
        }

        if (seen.includes(song.videoId)) {
            continue;
        }

        seen.push(song.videoId);

        clean.push(song);
    }

    return clean;
}

function sortPriorityFirst(queue) {
    const priority = [];
    const normal = [];

    for (const song of queue) {
        if (isPriority(song)) {
            priority.push(song);
        } else {
            normal.push(song);
        }
    }

    return [...priority, ...normal];
}

function isPriority(song) {
    return (
        song &&
        (
            song.priority === true ||
            song.priority === "true"
        )
    );
}

function loadConfig() {
    const configPath = path.join(
        __dirname,
        "godas_ytm_config.json"
    );

    if (!fs.existsSync(configPath)) {
        return null;
    }

    try {
        return JSON.parse(
            fs.readFileSync(configPath, "utf8")
        );
    } catch {
        return null;
    }
}

function httpGetText(url) {
    return fetch(url).then(async (response) => {
        const body = await response.text();

        if (!response.ok) {
            throw new Error(
                "HTTP " +
                response.status +
                " : " +
                body
            );
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
        return item
            .playlistPanelVideoWrapperRenderer
            .primaryRenderer
            .playlistPanelVideoRenderer;
    }

    return null;
}

function getFirstRunText(token) {
    if (
        !token ||
        !Array.isArray(token.runs) ||
        token.runs.length === 0
    ) {
        return "";
    }

    return token.runs[0].text || "";
}

async function getVar(vars, name) {
    if (!vars) return null;

    if (typeof vars.getCustomVariable === "function") {
        const value =
            await vars.getCustomVariable(name);

        if (
            value &&
            typeof value === "object" &&
            "value" in value
        ) {
            return value.value;
        }

        return value;
    }

    return null;
}

async function setVar(vars, name, value) {
    if (!vars) return;

    if (typeof vars.setCustomVariable === "function") {
        await vars.setCustomVariable(
            name,
            value
        );

        return;
    }

    if (typeof vars.addCustomVariable === "function") {
        await vars.addCustomVariable(
            name,
            value
        );
    }
}