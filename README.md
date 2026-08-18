# SwingUp Pro

Application unique qui réunit **Télémètre** et **Carte de score**, avec **son propre compte** (projet Firebase dédié, séparé de `SwingUp-Telemetre` et `SwingUp-Carte-de-Score`) et **un seul abonnement payant** : 4,90 €/mois, avec 7 jours d'essai gratuit, **sans palier gratuit permanent**.

## Structure du projet

- `index.html`, `manifest.json`, `sw.js`, `icons/` — la coquille SwingUp Pro : écran de connexion, écran d'abonnement (paywall obligatoire), puis barre d'onglets + les deux modules en iframes.
- `telemetre/` — copie du Télémètre, reconfigurée pour utiliser le compte SwingUp Pro (voir plus bas).
- `score/` — copie de la Carte de score, reconfigurée pour utiliser le compte SwingUp Pro.
- `functions/` — 3 Cloud Functions Stripe : `createCheckoutSession`, `createPortalLink`, `stripeWebhook`.
- `firestore.rules` — règles de sécurité (chacun ne lit/écrit que ses propres données ; le statut d'abonnement n'est modifiable que par les Cloud Functions).
- `firebase.json` — config minimale pour déployer les functions/règles avec la CLI Firebase.

## Comment ça s'articule

Un seul compte et un seul abonnement déverrouillent toute l'application :

1. Ouverture de l'app → écran de connexion (e-mail/mot de passe ou Google).
2. Une fois connecté, l'app vérifie `users/{uid}/billing/status` dans Firestore. Si aucun essai ni abonnement actif → écran d'abonnement obligatoire (« Commencer l'essai gratuit »), rien d'autre n'est accessible.
3. Une fois l'essai ou l'abonnement actif, la barre d'onglets et les deux modules apparaissent. Les deux modules (`telemetre/`, `score/`) utilisent **le même projet Firebase** que la coquille : ils voient donc automatiquement l'utilisateur déjà connecté et déjà abonné, sans redemander de connexion. Leurs propres écrans de connexion/abonnement internes ne servent plus que de filet de sécurité si l'un des deux est ouvert isolément, hors de SwingUp Pro.

Ce n'est **pas** la même chose que l'ancienne fusion « modules indépendants » : ici, il y a un seul compte, une seule base d'utilisateurs, un seul abonnement pour toute l'app.

## Mise en route — à faire une seule fois, dans l'ordre

Je n'ai pas accès à tes comptes Google/Firebase/Stripe depuis cette session (création de compte = action que je ne peux pas faire à ta place), donc ces étapes sont pour toi. Le code est déjà prêt à recevoir les valeurs.

### 1. Créer le projet Firebase

1. [console.firebase.google.com](https://console.firebase.google.com) → **Ajouter un projet** → nom `swingup-pro` (ou ce que tu veux).
2. **Authentication** → Sign-in method → activer **E-mail/Mot de passe** et **Google**.
3. **Firestore Database** → créer une base, mode production, région `eur3` (Europe) de préférence.
4. **Paramètres du projet** (roue crantée) → onglet **Général** → section « Vos applications » → **Ajouter une application → Web** → copier l'objet `firebaseConfig` généré (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
5. Colle ces valeurs à la place de `'A_REMPLIR'` à **3 endroits identiques** : `index.html` (racine), `telemetre/index.html`, `score/index.html` — cherche `const firebaseConfig` dans chaque fichier.
6. **Authentication → Settings → Authorized domains** : ajoute `julien67890.github.io` (le domaine où sera hébergée l'app).

### 2. Créer le produit Stripe (dans ton compte Stripe existant)

1. Dashboard Stripe → **Produits** → **Ajouter un produit** : nom `SwingUp Pro`, prix récurrent **4,90 € / mois**.
2. Copie l'**ID du prix** (commence par `price_...`).
3. Colle-le dans `functions/index.js`, à la place de `const PRICE_ID = 'A_REMPLIR';`.
4. Récupère ta **clé secrète Stripe** (Dashboard → Développeurs → Clés API → clé secrète, `sk_live_...` ou `sk_test_...` pour tester d'abord).

### 3. Déployer les Cloud Functions

```bash
npm install -g firebase-tools   # si pas déjà installé
firebase login
cd SwingUp-Pro
firebase use --add              # choisis ton projet swingup-pro

# secrets Stripe (jamais dans le code)
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET   # étape 4 ci-dessous d'abord pour l'avoir

cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules
```

Note les 3 URLs affichées à la fin du déploiement (`createCheckoutSession`, `createPortalLink`, `stripeWebhook`) — elles ressemblent à :
`https://europe-west1-swingup-pro.cloudfunctions.net/createCheckoutSession`

### 4. Configurer le webhook Stripe

1. Dashboard Stripe → **Développeurs → Webhooks → Ajouter un endpoint**.
2. URL : l'adresse `stripeWebhook` obtenue à l'étape 3.
3. Événements à écouter : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
4. Copie le **secret de signature** (`whsec_...`) et fais `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET` avec cette valeur (si pas déjà fait), puis redéploie : `firebase deploy --only functions`.

### 5. Finir de coller les URLs dans le code

Remplace `'A_REMPLIR'` par les vraies URLs de l'étape 3 :
- `index.html` (racine) : `CHECKOUT_URL` et `PORTAL_URL`.
- `telemetre/index.html` : `PREMIUM.checkoutUrl` et `PREMIUM.portalUrl` (filet de sécurité, cf. plus haut).
- `score/index.html` : idem.
- `functions/index.js` : `ALLOWED_ORIGINS` (déjà pré-rempli avec `https://julien67890.github.io`, à ajuster si ton domaine final est différent).

## Déployer le site sur GitHub Pages

```bash
# Depuis le dossier SwingUp-Pro
git init
git add .
git commit -m "SwingUp Pro : compte et abonnement dédiés"
git branch -M main
git remote add origin https://github.com/Julien67890/SwingUp-Pro.git
git push -u origin main
```

Puis **Settings → Pages → Deploy from a branch → main / (root)** sur le repo GitHub.
L'app sera servie sur `https://julien67890.github.io/SwingUp-Pro/`.

## Tester avant de passer en argent réel

Utilise une clé secrète Stripe **de test** (`sk_test_...`) et un webhook de test le temps de vérifier tout le parcours (inscription → essai → paiement carte test `4242 4242 4242 4242`) avant de repasser en clé `sk_live_...`.

## Icônes

Nouveau jeu d'icônes « SwingUp Pro » généré à partir du même repère (drapeau + balle) que les deux apps existantes, avec un fin liseré or. Fichiers dans `icons/` (source vectorielle : `icons/icon.svg`).

## Limites connues (préexistantes, pas liées à cette mise à jour)

- `telemetre/sw.js` référence `confidentialite.html`/`privacy.html` dans son pré-cache, fichiers absents du dossier `telemetre/` (contrairement à `score/`). Dis-moi si tu veux que je les ajoute.
- Les pages légales dans `score/` (`confidentialite.html`, `privacy.html`) décrivent encore l'ancien abonnement à 2,90 €/mois de la carte de score seule — à mettre à jour pour refléter SwingUp Pro à 4,90 €/mois si tu veux les réutiliser telles quelles pour la nouvelle app (je peux le faire si tu veux).
