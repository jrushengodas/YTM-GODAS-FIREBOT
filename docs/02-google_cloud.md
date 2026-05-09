# 🔑 GOOGLE CLOUD - CONFIGURATION V3

La V3 utilise jusqu’à **3 clés API YouTube**.

```text
❌ Plus besoin de OAuth Google
❌ Plus besoin de Playlist ID
❌ Plus besoin de Client Secret
```

---

## 1. Aller sur Google Cloud

```text
https://console.cloud.google.com/
```

---

## 2. Créer un projet

Créer un nouveau projet Google Cloud.

---

## 3. Activer YouTube Data API v3

Aller dans :

```text
API et services → Bibliothèque
```

Rechercher :

```text
YouTube Data API v3
```

Puis cliquer sur :

```text
Activer
```

---

## 4. Créer plusieurs clés API

Aller dans :

```text
API et services → Identifiants
```

Créer :

```text
Clé API 1
Clé API 2
Clé API 3
```

---

## 5. Utilisation dans Firebot

Dans le setup `!godasytm`, remplir :

```text
youtubeApiKey1
youtubeApiKey2
youtubeApiKey3
```

Le système utilisera automatiquement :
- rotation des clés
- retry automatique
- protection quota

---

## 💡 Pourquoi plusieurs clés API ?

Chaque clé YouTube possède une limite de quota quotidienne.

La V3 :
- change automatiquement de clé
- réessaie automatiquement les requêtes
- augmente énormément le nombre de SR possibles

---

## ⚡ Quota estimé

```text
1 clé API  ≈ ~100 SR / jour
3 clés API ≈ ~300 SR / jour
```

(peut varier selon les recherches)

---

## ✅ Configuration terminée
