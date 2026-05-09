# 🎧 CONFIG YOUTUBE MUSIC DESKTOP

---

## 1. Installer YouTube Music Desktop

Télécharger :

```text
https://ytmdesktop.app/
```

Installer puis lancer l’application.

---

## 2. Activer le Companion Server

Dans YouTube Music Desktop :

```text
Paramètres → Intégrations → Companion Server
```

Configurer :

```text
Activé : Oui
Hôte : 127.0.0.1
Port : 26538
Autorisation : Pas d’autorisation
```

---

## 3. Redémarrer l’application

Après modification :

```text
Fermer complètement YTM Desktop
Puis relancer l’application
```

---

## 4. Tester l’API

Ouvrir dans le navigateur :

```text
http://127.0.0.1:26538/swagger
```

Si la page s’ouvre :

```text
✅ API fonctionnelle
```

---

## 5. Valeurs recommandées

```text
ytmHost = 127.0.0.1
ytmPort = 26538
```

---

## 6. Fonctionnement

Le système GODAS communique directement avec :

```text
YouTube Music Desktop API
```

Cela permet :
- lecture automatique
- skip automatique
- queue automatique
- next automatique
- récupération musique actuelle

---

## ⚠️ Important

YouTube Music Desktop doit rester ouvert pendant le stream.

Si l’application est fermée :

```text
❌ Les SR ne fonctionneront plus
❌ Le watcher ne pourra plus communiquer
```

---

## ✅ YTM Desktop prêt
