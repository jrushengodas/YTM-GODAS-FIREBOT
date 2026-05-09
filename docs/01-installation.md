# ⚡ INSTALLATION - YTM GODAS DEV V3 FIREBOT

⚠️ IMPORTANT :  
Suivre les étapes dans l’ordre.

---

## 1. Lancer YouTube Music Desktop

Lancer :

```text
YouTube Music Desktop.exe
```

---

## 2. Activer l’API YouTube Music Desktop

Dans YouTube Music Desktop :

```text
Paramètres → Intégrations → Companion Server
```

Mettre :

```text
Activé : Oui
Hôte : 127.0.0.1
Port : 26538
Autorisation : Désactivée / Pas d’autorisation
```

Redémarrer YouTube Music Desktop après modification.

---

## 3. Importer les scripts Firebot

Copier tous les fichiers `.js` dans :

```text
Firebot/v5/profiles/Main/scripts/
```

Scripts :

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

## 4. Créer les commandes Firebot

Créer les commandes suivantes :

```text
!godasytm
!sr
!song
!next
!nextsr
!playlist
!skip
!prio
!clear
```

Chaque commande doit :
- lancer le script correspondant
- puis envoyer :

```text
$customVariable[ytm_sr_last_message_godas]
```

---

## 5. Configurer le setup

Dans le script setup `godas_setup.js`, renseigner :

```text
youtubeApiKey1
youtubeApiKey2
youtubeApiKey3
ytmHost
ytmPort
```

Valeurs recommandées :

```text
ytmHost = 127.0.0.1
ytmPort = 26538
```

---

## 6. Lancer le setup

Dans le chat Twitch :

```text
!godasytm
```

---

## 7. Créer le Watcher Timer

Dans Firebot :

```text
Timers → Nouveau Timer
```

Configuration :

```text
Nom : GODAS WATCHER
Interval : 5 secondes
Enabled : Oui
```

Ajouter l’effet :

```text
Run Custom Script → godas_watcher.js
```

---

## 8. Tester le système

```text
!sr nom musique artiste
!song
!next
!playlist
!skip
!prio musique
!clear
```

---

## ✅ Installation terminée
