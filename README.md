<p align="center">
  <img src="assets/logo.jpg" width="400">
</p>

<h1 align="center">🔥 YTM Song Request V3 - Godas DEV</h1>

<p align="center">
  Advanced YouTube Music Song Request System for Firebot
</p>

<p align="center">
  <a href="https://github.com/jrushengodas/ytm-godas-firebot/archive/refs/heads/main.zip">
    <img src="https://img.shields.io/badge/⬇️_DOWNLOAD-ZIP_COMPLETE-00ff99?style=for-the-badge&logo=github&logoColor=white">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-stable-green">
  <img src="https://img.shields.io/badge/version-3.0-blue">
  <img src="https://img.shields.io/badge/Firebot-compatible-purple">
  <img src="https://img.shields.io/badge/YTMDesktop-supported-red">
</p>

---

# 🚀 Features

- 🎶 Song Request via `!sr`
- ⚡ Ultra fast local queue system
- 🔥 Real Skip Prio system
- 🎧 Full YouTube Music Desktop compatibility
- 🔗 YouTube / YouTube Music links support
- 🧠 Advanced intelligent search
- 🔑 Multi YouTube API Keys support
- 🔄 Retry system anti quota / anti bug
- 📜 Queue & playlist system
- ⏭️ Current / next song commands
- 🧹 Full queue cleaner
- ⚡ Firebot ready

---

# 🧠 Intelligent Search System

The V3 automatically analyzes :

```text
✅ Song title
✅ Artist name
✅ Official versions
✅ Official audio
✅ VEVO / official channels
```

Automatically avoids :

```text
❌ sped up
❌ slowed
❌ remix
❌ nightcore
❌ live
❌ karaoke
❌ playlist
❌ reactions
```

---

# 🔥 Why V3 ?

Complete rewrite of the old system :

```text
❌ No more Google OAuth
❌ No more YouTube playlists
❌ No more unstable queue system
❌ No more StreamElements limitations
```

New architecture :

```text
✅ Smart local queue
✅ Real priority system
✅ Stable Skip Prio
✅ Multi API Keys
✅ Automatic retries
✅ Better precision
✅ Firebot support
```

---

# ⚡ Architecture

```text
Viewer
   ↓
Firebot
   ↓
GODAS Local Queue
   ↓
Watcher V3
   ↓
YouTube Music Desktop
```

---

# 🎮 Commands

```text
!sr music          → Add a song
!song              → Current song
!next              → Next YTM song
!nextsr            → Next local SR
!playlist          → Show SR queue
!skip              → Skip current song
!prio music        → Skip Prio
!clear             → Clear all queue
```

---

# 🔥 Firebot Rewards

```text
🎵 SR FIRE
🔥 Skip Prio FIRE
⏭️ Skip FIRE
```

---

# 🔑 Multi API Keys

V3 supports multiple YouTube API Keys :

```text
✅ Automatic key rotation
✅ Quota protection
✅ Retry system
✅ Much more SR per day
```

---

# 📚 Documentation

- 📄 Installation
- 📄 Google Cloud API Setup
- 📄 YTM Desktop Setup
- 📄 Firebot Setup
- 📄 Commands
- 📄 Rewards
- 📄 Credits

---

# ⚡ Quick Installation

## 1️⃣ Install YouTube Music Desktop

Enable :

```text
Settings → Integrations → Companion Server
```

Default port :

```text
26538
```

---

## 2️⃣ Create YouTube API Keys

Create 1 to 3 API Keys from :

```text
Google Cloud Console
```

Enable :

```text
YouTube Data API v3
```

---

## 3️⃣ Import scripts into Firebot

Copy all `.js` scripts into :

```text
Firebot/v5/profiles/Main/scripts/
```

---

## 4️⃣ Run setup script

Launch :

```text
godas_setup.js
```

Fill :
- API Key 1
- API Key 2
- API Key 3
- Host
- Port

---

# ❤️ Credits

## Development

Godas DEV

## Technologies

- Firebot
- Node.js
- YouTube Data API v3
- YouTube Music Desktop

---

# 🛠 Troubleshooting

Check :

- YouTube Music Desktop is running
- Companion Server enabled
- Port `26538`
- API Keys valid
- Watcher enabled inside Firebot

---

# 📦 Repository Structure

```text
scripts/
├── godas_setup.js
├── godas_sr.js
├── godas_watcher.js
├── godas_skip.js
├── godas_skip_prio.js
├── godas_song.js
├── godas_next.js
├── godas_nextsr.js
├── godas_playlist.js
├── godas_clear.js
```

---

<p align="center">
  ⚡ YTM Song Request System V3
  <br>
  Developed with ❤️ by <strong>Godas DEV</strong>
  <br><br>
  <img src="https://img.shields.io/badge/GODAS-DEV-00ff99?style=for-the-badge">
  <br><br>
  <sub>Made with passion for Twitch streamers 🎧</sub>
</p>
