# 🔥 FIREBOT SETUP - YTM GODAS V3

---

## 1. Importer les scripts

Copier tous les scripts `.js` dans :

```text
Firebot/v5/profiles/Main/scripts/
```

---

## 2. Scripts nécessaires

```text
godas_setup.js
godas_sr.js
godas_watcher.js
godas_song.js
godas_next.js
godas_nextsr.js
godas_playlist.js
godas_skip.js
godas_skip_prio.js
godas_clear.js
```

---

# ⚡ Création des commandes

---

## !godasytm

### Effets :

```text
1. Run Custom Script → godas_setup.js
2. Chat Message → $customVariable[ytm_sr_last_message_godas]
```

---

## !sr

### Effets :

```text
1. Run Custom Script → godas_sr.js
2. Chat Message → $customVariable[ytm_sr_last_message_godas]
```

---

## !song

### Effets :

```text
1. Run Custom Script → godas_song.js
2. Chat Message → $customVariable[ytm_sr_last_message_godas]
```

---

## !next

### Effets :

```text
1. Run Custom Script → godas_next.js
2. Chat Message → $customVariable[ytm_sr_last_message_godas]
```

---

## !nextsr

### Effets :

```text
1. Run Custom Script → godas_nextsr.js
2. Chat Message → $customVariable[ytm_sr_last_message_godas]
```

---

## !playlist

### Effets :

```text
1. Run Custom Script → godas_playlist.js
2. Chat Message → $customVariable[ytm_sr_last_message_godas]
```

---

## !skip

### Effets :

```text
1. Run Custom Script → godas_skip.js
2. Chat Message → $customVariable[ytm_sr_last_message_godas]
```

---

## !prio

### Effets :

```text
1. Run Custom Script → godas_skip_prio.js
2. Chat Message → $customVariable[ytm_sr_last_message_godas]
```

---

## !clear

### Effets :

```text
1. Run Custom Script → godas_clear.js
2. Chat Message → $customVariable[ytm_sr_last_message_godas]
```

---

# ⏱️ Configuration du Watcher

Créer un Timer :

```text
Timers → Nouveau Timer
```

---

## Configuration recommandée

```text
Nom : GODAS WATCHER
Interval : 5 secondes
Enabled : Oui
```

---

## Effet du timer

```text
Run Custom Script → godas_watcher.js
```

---

# 🔥 Rewards Firebot

Créer les rewards :

```text
🎵 SR FIRE
🔥 Skip Prio FIRE
⏭️ Skip FIRE
```

---

## Reward SR FIRE

### Effets :

```text
1. Run Custom Script → godas_sr.js
2. Chat Message → $customVariable[ytm_sr_last_message_godas]
```

---

## Reward Skip FIRE

### Effets :

```text
1. Run Custom Script → godas_skip.js
2. Chat Message → $customVariable[ytm_sr_last_message_godas]
```

---

## Reward Skip Prio FIRE

### Effets :

```text
1. Run Custom Script → godas_skip_prio.js
2. Chat Message → $customVariable[ytm_sr_last_message_godas]
```

---

# ✅ Firebot prêt
