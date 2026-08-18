# SwingUp Pro

Coquille unique qui réunit les deux applications existantes :

- `telemetre/` — copie inchangée de **SwingUp – Télémètre** (son propre Firebase, son propre Service Worker).
- `score/` — copie inchangée de **SwingUp – Carte de score** (son propre Firebase, son propre Service Worker).
- `index.html`, `manifest.json`, `sw.js`, `icons/` — la coquille SwingUp Pro : barre d'onglets en bas, chargement des deux apps dans des `<iframe>` du même domaine, une seule icône/install PWA pour l'ensemble.

Les deux modules restent **indépendants** : chacun garde son compte, ses données Firestore et son cache offline. Seuls des tweaks CSS non intrusifs ont été ajoutés dans `telemetre/index.html` et `score/index.html` (bloc `<style>` "Overrides mode embarqué" juste avant `</head>`, + une ligne `<script>` juste après `<head>`) pour éviter de compter deux fois les marges de sécurité (encoche, barre du bas) quand l'app tourne dans l'iframe.

## Comment ça bascule

- Le tap sur un onglet affiche l'iframe correspondante ; l'autre reste montée mais masquée (`display:none`), donc la partie GPS en cours ou la saisie de score en cours ne sont **jamais perdues** en changeant d'onglet.
- Le module non actif au démarrage n'est chargé qu'au premier tap dessus (chargement paresseux), pour ne pas demander la géolocalisation ni ouvrir deux connexions Firebase inutilement.
- `?view=score` sur l'URL ouvre directement la carte de score (utilisé par le raccourci PWA "Carte de score").

## Déployer sur GitHub Pages

```bash
# Depuis le dossier SwingUp-Pro
git init
git add .
git commit -m "SwingUp Pro : coquille unifiée Télémètre + Carte de score"
git branch -M main
git remote add origin https://github.com/Julien67890/SwingUp-Pro.git
git push -u origin main
```

Puis dans les réglages du repo GitHub : **Settings → Pages → Deploy from a branch → main / (root)**.

L'app sera servie sur `https://julien67890.github.io/SwingUp-Pro/`.

## Point d'attention Firebase (à vérifier une fois, pas de code à changer)

Les deux Firebase (`swingup-telemetre` et `swingup-92a94`) autorisent déjà le domaine `julien67890.github.io` (puisque c'est celui où vivent les 2 apps actuelles). SwingUp Pro sera hébergée sur ce même hostname, juste un chemin différent (`/SwingUp-Pro/` au lieu de `/SwingUp-Telemetre/` ou `/SwingUp-Carte-de-Score/`) — les domaines autorisés Firebase fonctionnent par hostname, pas par chemin, donc la connexion Google/e-mail devrait fonctionner sans rien changer. À vérifier une fois en ligne : si la connexion Google échoue, ajouter `julien67890.github.io` dans Firebase Console → Authentication → Settings → Authorized domains sur les deux projets (il y est probablement déjà).

## Icônes

Un nouveau jeu d'icônes "SwingUp Pro" a été généré à partir du même repère (drapeau + balle) que les deux apps existantes, avec un fin liseré or pour le distinguer comme app "hub". Fichiers dans `icons/` (source vectorielle : `icons/icon.svg`).

## Limite connue (préexistante, pas liée à la fusion)

`telemetre/sw.js` référence `confidentialite.html` et `privacy.html` dans sa liste de pré-cache, mais ces deux fichiers n'existent pas dans le dossier `telemetre/` (contrairement à `score/`). C'était déjà le cas dans le repo `SwingUp-Telemetre` d'origine — non corrigé ici pour ne pas toucher à la logique du module. Si vous voulez que je l'ajoute, je peux dupliquer les pages légales de `score/` vers `telemetre/`.
