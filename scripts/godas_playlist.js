exports.getScriptManifest = () => ({
    name: "GODAS YTM V3 - Playlist",
    description: "Affiche la playlist SR",
    author: "Godas DEV",
    version: "1.0.0",
    firebotVersion: "5"
});

exports.getDefaultParameters = () => Promise.resolve({});

exports.run = async (runRequest) => {
    const logger = runRequest.modules.logger;
    const vars = runRequest.modules.customVariableManager;

    try {
        let queue = await getQueue(vars);

        if (queue.length === 0) {
            await setVar(vars, "ytm_sr_last_message_godas", "🎵 Aucune SR active.");
            return true;
        }

        queue = sortPriorityFirst(queue);

        let message = "🎶 Playlist SR : ";

        const max = Math.min(queue.length, 5);

        for (let i = 0; i < max; i++) {
            const song = queue[i];

            const title = song.title || "Titre inconnu";
            const user = song.user || "inconnu";
            const duration = song.durationText || "??:??";
            const priority = isPriority(song) ? "⚡ " : "";

            message += `#${i + 1} ${priority}${title} (${duration}) par ${user}`;

            if (i < max - 1) {
                message += " | ";
            }
        }

        if (queue.length > 5) {
            message += " | +" + (queue.length - 5) + " autre(s) musique(s)";
        }

        await setVar(vars, "ytm_sr_last_message_godas", message);

        return true;

    } catch (err) {
        logger.error("Erreur playlist SR : " + err.stack);

        await setVar(
            runRequest.modules.customVariableManager,
            "ytm_sr_last_message_godas",
            "❌ Erreur affichage playlist SR."
        );

        return false;
    }
};

async function getQueue(vars) {
    let queue = await getVar(vars, "ytm_sr_queue_godas");

    if (Array.isArray(queue)) {
        return queue;
    }

    try {
        return JSON.parse(queue || "[]");
    } catch {
        return [];
    }
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
    return song && (song.priority === true || song.priority === "true");
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