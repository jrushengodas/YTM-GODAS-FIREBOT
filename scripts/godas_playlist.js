exports.getScriptManifest = () => ({
    name: "GODAS YTM V3.1 - Playlist",
    description: "Affiche la playlist SR V3.1",
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

        const waitingVideoId =
            (await getVar(vars, "ytm_sr_waiting_videoid_godas")) || "";

        const currentTitle =
            (await getVar(vars, "ytm_nowplaying_title_godas")) ||
            (await getVar(vars, "ytm_current_song_title_godas")) ||
            "";

        const currentArtist =
            (await getVar(vars, "ytm_nowplaying_artist_godas")) || "";

        const currentUser =
            (await getVar(vars, "ytm_current_song_user_godas")) || "";

        queue = cleanQueue(queue);
        queue = sortPriorityFirst(queue);

        const displayed = [];
        const lines = [];

        // CURRENT
        if (currentTitle) {
            let currentLine = `▶ ${currentTitle}`;

            if (currentArtist) {
                currentLine = `▶ ${currentArtist} - ${currentTitle}`;
            }

            if (currentUser) {
                currentLine += ` — ${currentUser}`;
            }

            lines.push(currentLine);
        }

        // WAITING
        if (waitingVideoId) {
            const waitingSong = queue.find(
                s => s && s.videoId === waitingVideoId
            );

            if (waitingSong) {
                displayed.push(waitingVideoId);

                const title =
                    waitingSong.title || "Musique inconnue";

                const user =
                    waitingSong.user || "inconnu";

                const duration =
                    waitingSong.durationText || "??:??";

                const priority =
                    isPriority(waitingSong) ? "[PRIO] " : "";

                lines.push(
                    `⏳ ${priority}${title} (${duration}) — ${user}`
                );
            }
        }

        // NEXT SONGS
        let count = 0;

        for (const song of queue) {
            if (!song || !song.videoId) continue;

            if (displayed.includes(song.videoId)) continue;

            const title =
                song.title || "Musique inconnue";

            const user =
                song.user || "inconnu";

            const duration =
                song.durationText || "??:??";

            const priority =
                isPriority(song) ? "[PRIO] " : "";

            lines.push(
                `${count + 1}. ${priority}${title} (${duration}) — ${user}`
            );

            displayed.push(song.videoId);

            count++;

            // max affichage twitch
            if (count >= 4) break;
        }

        if (lines.length === 0) {
            await setVar(
                vars,
                "ytm_sr_last_message_godas",
                "Aucune SR active."
            );

            return true;
        }

        const remaining = queue.filter(
            s =>
                s &&
                s.videoId &&
                !displayed.includes(s.videoId)
        ).length;

        let message =
            "Playlist SR : " + lines.join(" | ");

        if (remaining > 0) {
            message += ` | +${remaining} autre(s)`;
        }

        // sécurité longueur twitch
        if (message.length > 450) {
            message = message.substring(0, 447) + "...";
        }

        await setVar(
            vars,
            "ytm_sr_last_message_godas",
            message
        );

        logger.info("PLAYLIST V3.1 | " + message);

        return true;

    } catch (err) {
        logger.error(
            "PLAYLIST V3.1 ERROR : " + err.stack
        );

        await setVar(
            runRequest.modules.customVariableManager,
            "ytm_sr_last_message_godas",
            "Erreur affichage playlist SR."
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

        // évite doublons
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

async function getVar(vars, name) {
    if (!vars) return null;

    if (typeof vars.getCustomVariable === "function") {
        const value = await vars.getCustomVariable(name);

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
        await vars.setCustomVariable(name, value);
        return;
    }

    if (typeof vars.addCustomVariable === "function") {
        await vars.addCustomVariable(name, value);
    }
}