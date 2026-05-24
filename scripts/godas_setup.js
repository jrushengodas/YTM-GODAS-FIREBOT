const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

exports.getScriptManifest = () => ({
    name: "GODAS YTM V3.1 - Setup",
    description: "Setup YTM Godas V3.1 pour Firebot",
    author: "Godas DEV",
    version: "3.1.0",
    firebotVersion: "5"
});

exports.getDefaultParameters = () => {
    return Promise.resolve({
        youtubeApiKey1: {
            type: "string",
            description: "Clé API YouTube 1",
            default: ""
        },

        youtubeApiKey2: {
            type: "string",
            description: "Clé API YouTube 2",
            default: ""
        },

        youtubeApiKey3: {
            type: "string",
            description: "Clé API YouTube 3",
            default: ""
        },

        ytmHost: {
            type: "string",
            description: "Host YTM",
            default: "127.0.0.1"
        },

        ytmPort: {
            type: "string",
            description: "Port YTM",
            default: "26538"
        }
    });
};

exports.run = async (runRequest) => {
    const logger = runRequest.modules.logger;
    const vars = runRequest.modules.customVariableManager;
    const parameters = runRequest.parameters || {};

    try {
        logger.info("GODAS SETUP V3.1 | Script lancé");

        const youtubeApiKey1 = (parameters.youtubeApiKey1 || "").toString().trim();
        const youtubeApiKey2 = (parameters.youtubeApiKey2 || "").toString().trim();
        const youtubeApiKey3 = (parameters.youtubeApiKey3 || "").toString().trim();

        const ytmHost = (parameters.ytmHost || "127.0.0.1").toString().trim();
        const ytmPort = (parameters.ytmPort || "26538").toString().trim();

        const youtubeApiKeys = [
            youtubeApiKey1,
            youtubeApiKey2,
            youtubeApiKey3
        ].filter(key => key && key.trim() !== "");

        if (youtubeApiKeys.length === 0) {
            await setVar(
                vars,
                "ytm_sr_last_message_godas",
                "❌ Setup incomplet : ajoute au moins une clé API YouTube."
            );

            logger.error("GODAS SETUP V3.1 | Aucune clé API YouTube renseignée.");

            return {
                success: false
            };
        }

        const configPath = path.join(__dirname, "godas_ytm_config.json");

        const config = {
            youtubeApiKeys,
            ytmHost,
            ytmPort
        };

        fs.writeFileSync(
            configPath,
            JSON.stringify(config, null, 4),
            "utf8"
        );

        await initVars(vars);

        await setVar(
            vars,
            "ytm_sr_last_message_godas",
            `✅ GODAS YTM configuré avec succès ! ${youtubeApiKeys.length} clé(s) API sauvegardée(s).`
        );

        logger.info("GODAS SETUP V3.1 | Config sauvegardée");
        logger.info("GODAS SETUP V3.1 | Clés API sauvegardées : " + youtubeApiKeys.length);
        logger.info("GODAS SETUP V3.1 | Config path : " + configPath);
        logger.info("GODAS SETUP V3.1 | Host : " + ytmHost);
        logger.info("GODAS SETUP V3.1 | Port : " + ytmPort);

        openSuccessPage(ytmHost, ytmPort, youtubeApiKeys.length, logger);

        return {
            success: true
        };

    } catch (err) {
        logger.error("GODAS SETUP V3.1 | ERREUR : " + err.stack);

        try {
            await setVar(
                vars,
                "ytm_sr_last_message_godas",
                "❌ Erreur setup GODAS YTM."
            );
        } catch {}

        return {
            success: false
        };
    }
};

async function initVars(vars) {
    await setVar(vars, "ytm_sr_queue_godas", "[]");
    await setVar(vars, "ytm_sr_history_godas", "[]");
    await setVar(vars, "ytm_sr_played_history_godas", "[]");

    await setVar(vars, "ytm_sr_cache_godas", "{}");

    await setVar(vars, "ytm_sr_added_count_godas", "0");

    await setVar(vars, "ytm_sr_active_videoid_godas", "");
    await setVar(vars, "ytm_sr_waiting_videoid_godas", "");
    await setVar(vars, "ytm_sr_waiting_since_godas", "");
    await setVar(vars, "ytm_sr_waiting_retry_godas", "");
    await setVar(vars, "ytm_sr_waiting_priority_godas", "");

    await setVar(vars, "ytm_sr_stuck_videoid_godas", "");
    await setVar(vars, "ytm_sr_stuck_since_godas", "");

    await setVar(vars, "ytm_sr_last_launch_ticks_godas", "");
    await setVar(vars, "ytm_sr_last_requeue_current_godas", "");
    await setVar(vars, "ytm_sr_last_current_videoid_godas", "");

    await setVar(vars, "ytm_current_song_title_godas", "");
    await setVar(vars, "ytm_current_song_user_godas", "");
    await setVar(vars, "ytm_current_song_url_godas", "");

    await setVar(vars, "ytm_nowplaying_title_godas", "");
    await setVar(vars, "ytm_nowplaying_artist_godas", "");
    await setVar(vars, "ytm_nowplaying_videoid_godas", "");
    await setVar(vars, "ytm_nowplaying_url_godas", "");

    await setVar(vars, "ytm_watcher_last_videoid_godas", "");
    await setVar(vars, "ytm_watcher_last_title_godas", "");

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

function openSuccessPage(host, port, apiKeyCount, logger) {
    const setupPort = 5000;

    const html = `
<html>
<head>
<meta charset="UTF-8">
<title>GODAS YTM V3.1</title>

<style>
body{
    margin:0;
    background:#111827;
    color:white;
    font-family:Arial, sans-serif;
    display:flex;
    align-items:center;
    justify-content:center;
    min-height:100vh;
}

.card{
    text-align:center;
    padding:50px 60px;
    border-radius:30px;
    background:#1f2937;
    box-shadow:0 0 45px rgba(0,255,153,.35);
    max-width:700px;
}

.logo{
    width:220px;
    height:220px;
    object-fit:cover;
    border-radius:28px;
    box-shadow:0 0 45px rgba(0,255,153,.95);
}

.badge{
    display:inline-block;
    padding:10px 18px;
    border-radius:999px;
    background:rgba(0,255,153,.15);
    color:#00ff99;
    font-weight:bold;
    margin-top:25px;
}

h1{
    color:#00ff99;
    font-size:42px;
}

p{
    font-size:18px;
}

.line{
    margin:25px 0;
    height:1px;
    background:rgba(255,255,255,.1);
}
</style>
</head>

<body>
<div class="card">

<img class="logo"
src="https://raw.githubusercontent.com/jrushengodas/YTM-GODAS-FIREBOT/main/assets/logo.jpg">

<div class="badge">GODAS YTM V3.1</div>

<h1>✅ Setup réussi</h1>

<p>Configuration sauvegardée.</p>

<div class="line"></div>

<p>${apiKeyCount} clé(s) API YouTube sauvegardée(s)</p>
<p>Variables Firebot initialisées</p>
<p>Queue locale prête</p>
<p>Watcher V3.1 prêt</p>
<p>Host : ${host} • Port : ${port}</p>

</div>
</body>
</html>
`;

    const server = http.createServer((req, res) => {
        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store"
        });

        res.end(html);

        setTimeout(() => {
            server.close();
        }, 1000);
    });

    server.on("error", (err) => {
        logger.info("GODAS SETUP V3.1 | Page setup impossible : " + err.message);
    });

    server.listen(setupPort, "127.0.0.1", () => {
        const url = `http://127.0.0.1:${setupPort}/`;

        logger.info("GODAS SETUP V3.1 | Ouverture page setup : " + url);

        try {
            exec(`start "" "${url}"`);
        } catch (err) {
            logger.info("GODAS SETUP V3.1 | Ouverture navigateur impossible : " + err.message);
        }
    });
}