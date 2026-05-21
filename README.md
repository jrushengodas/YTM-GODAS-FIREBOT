<p align="center">
  <img src="https://raw.githubusercontent.com/jrushengodas/YTM-GODAS-FIREBOT/main/assets/logo.jpg" width="400">
</p>

<h1 align="center">YTM Song Request V3.1 - Godas DEV</h1>

<p align="center">
  Advanced YouTube Music Song Request System for Firebot
</p>

<p align="center">
  <a href="https://github.com/jrushengodas/YTM-GODAS-FIREBOT/releases/latest/download/YTM-GODAS-FIREBOT.zip">
    <img src="https://img.shields.io/badge/⬇️_DOWNLOAD-COMPLETE_PACKAGE-00ff99?style=for-the-badge&logo=github&logoColor=white">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-stable-green">
  <img src="https://img.shields.io/badge/version-3.1-blue">
  <img src="https://img.shields.io/badge/Firebot-compatible-purple">
  <img src="https://img.shields.io/badge/YTMDesktop-supported-red">
</p>

---

# Features

- Song Request via `!sr`
- Priority SR system
- Smart local queue system
- YouTube / YouTube Music links support
- Search by title + artist
- Multi YouTube API Keys support
- Smart retry system
- Auto timeout recovery
- Auto stuck song detection
- Fake current detection
- Auto skip protection
- Playlist sync system
- Dynamic SR reinjection
- Anti duplicate queue system
- Anti Shorts protection
- Smart ghost song detection
- Local queue priority sync
- Current / next song commands
- Playlist viewer
- Full queue cleaner
- Firebot compatible
- YouTube Music Desktop compatible

---

# What's New In V3.1

V3.1 introduces a complete stability rewrite of the watcher system.

New protections :

```text
✅ Fake current detection
✅ Waiting timeout recovery
✅ Auto reinjection system
✅ Auto skip on stuck songs
✅ Playlist change detection
✅ Queue resync system
✅ Better YTM Desktop compatibility
✅ Invalid cache protection
✅ Retry logic improvements
✅ Anti duplicate queue system
✅ Smart ghost song detection
✅ Anti Shorts protection
```

---

# Intelligent Search System

The system automatically analyzes :

```text
✅ Song title
✅ Artist name
✅ Official versions
✅ Official audio
✅ VEVO / official channels
✅ YouTube Music links
```

Automatically avoids :

```text
❌ YouTube Shorts
❌ sped up
❌ slowed
❌ remix
❌ nightcore
❌ live
❌ karaoke
❌ reactions
❌ playlists
❌ TikTok edits
```

---

# Why V3.1 ?

Complete evolution of the old V3 architecture :

```text
❌ No unstable queue system
❌ No broken fake current
❌ No frozen SR
❌ No dead playlist transitions
❌ No duplicate insertions
❌ No ghost songs
```

New architecture :

```text
✅ Smart local queue
✅ Stable watcher system
✅ Playlist synchronization
✅ Dynamic reinjection
✅ Better retry system
✅ Automatic recovery
✅ Firebot optimized
✅ Stable queue handling
```

---

# Architecture

```text
Viewer
   ↓
Firebot
   ↓
GODAS Local Queue
   ↓
Watcher V3.1
   ↓
YouTube Music Desktop
```

---

# Commands

```text
!sr music          → Add a song
!song              → Current song
!next              → Next YTM song
!playlist          → Show SR queue
!skip              → Skip current song
!prio music        → Priority SR
!clear             → Clear queue
```

---

# Watcher V3.1 Protections

```text
✅ Detects fake current songs
✅ Handles broken YTM queue states
✅ Handles playlist changes
✅ Auto retries failed SR
✅ Auto skip impossible songs
✅ Protects against frozen SR
✅ Queue synchronization system
✅ Anti duplicate insertion
✅ Smart stuck detection
```

---

# Multi API Keys

Supports multiple YouTube API Keys :

```text
✅ Automatic key rotation
✅ Quota protection
✅ Retry system
✅ Massive SR capacity
```

---

# Compatibility

```text
✅ Firebot
✅ YouTube Music Desktop
✅ Companion Server
```

---

# Requirements

```text
- Firebot
- YouTube Music Desktop
- Companion Server enabled
- Port 26538
- YouTube API Keys
```

---

# Quick Installation

## 1. Install YouTube Music Desktop

Enable :

```text
Settings → Integrations → Companion Server
```

Default port :

```text
26538
```

---

## 2. Import Scripts Into Firebot

Place all `.js` files inside your Firebot scripts folder.

---

## 3. Run Setup

Execute :

```text
godas_setup.js
```

Fill :

```text
- API Key 1
- API Key 2
- API Key 3
- Host
- Port
```

---

## 4. Start The Watcher

Recommended :

```text
Every 5 seconds
```

---

# Troubleshooting

Check :

```text
- YTM Desktop is running
- Companion Server enabled
- Port 26538 open
- API Keys valid
- Watcher enabled
- Queue variables initialized
```

---

# Repository Structure

```text
scripts/
├── godas_clear.js
├── godas_next.js
├── godas_playlist.js
├── godas_prio.js
├── godas_setup.js
├── godas_skip.js
├── godas_skip_prio.js
├── godas_song.js
├── godas_sr.js
├── godas_watcher.js
├── godas_ytm_config.json
```

---

# Technologies

- Firebot
- Node.js
- JavaScript
- YouTube Data API v3
- YouTube Music Desktop

---

# Credits

Development :  
Godas DEV

Special thanks :  
Twitch community testers

---

<p align="center">
  YTM Song Request System V3.1
  <br>
  Developed by <strong>Godas DEV</strong>
  <br><br>
  <img src="https://img.shields.io/badge/GODAS-DEV-00ff99?style=for-the-badge">
</p>
