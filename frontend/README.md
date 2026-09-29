# strock — interface PC

Front React / TypeScript / Vite du jeu **Stroks_stellar**, conçu pour une fenêtre de navigateur maximisée. Le contrat Rust et les scripts du back restent inchangés.

## Jouer en ligne

**[Ouvrir strock — accès public](https://strock-stellar.reda-guettache.chatgpt.site)**

Aucune installation pour le mode Démo. L’ordinateur qui a servi à développer le projet peut être éteint : le site est hébergé en HTTPS. Le mode Testnet demande Freighter et des XLM de test. [Détails de publication et mises à jour](docs/deployment.md).

## Installation et lancement

Prérequis : **Node.js 22.12+** (validé avec 22.20), npm, et ce dépôt complet. Aucun environnement Rust ou Stellar CLI n’est nécessaire pour le front.

Depuis la racine du dépôt, exécuter dans l’ordre :

```powershell
npm ci --prefix bindings
npm run build --prefix bindings
npm ci --prefix frontend
npm run dev --prefix frontend
```

Ouvrir **http://127.0.0.1:5173/**. Le serveur reste actif tant que son terminal reste ouvert. `Ctrl+C` l’arrête. Si PowerShell bloque `npm.ps1`, utiliser `npm.cmd` à la place de `npm`, sans modifier la politique de sécurité.

Pour présenter la version compilée :

```powershell
npm run check --prefix frontend
npm run preview --prefix frontend
```

Ouvrir **http://127.0.0.1:4173/**. Garder ce même navigateur et cette même adresse pendant toute la démo : les références de transactions sont conservées par origine (le port fait partie de l’origine). Ne pas ouvrir directement `dist/index.html`.

## Mode démo

Le jeu démarre sans Freighter avec **100 XLM fictifs**. Aucune requête Stellar n’est effectuée dans ce mode. Les polices et illustrations sont locales.

Dans **Commandes démo**, choisir un scénario et réinitialiser le solde. Le parcours jury est : victoire → égalité → victoire → défaite. Les autres scénarios reproduisent un refus de signature, une confirmation lente, une erreur après envoi et une banque insuffisamment financée.

Déroulé conseillé : miser 10, gagner (solde 110), remiser 20, faire égalité (solde 110), rejouer 20 et gagner (solde 130), puis revenir au menu. Montrer ensuite le scénario d’erreur réseau et « Vérifier à nouveau ».

« Réduire les animations » remplace le rouleau par une révélation directe. La préférence système est également respectée. Tout le parcours est accessible au clavier avec Tab, Entrée/Espace et Échap pour fermer les fenêtres.

## Mode Stellar Testnet

1. Ouvrir le front dans un navigateur avec **Freighter installé**.
2. Dans Freighter, sélectionner **Testnet** et financer le compte avec les XLM de test proposés par le portefeuille.
3. Sélectionner **Stellar Testnet**, puis **Connecter Freighter**.
4. Choisir une petite mise, sélectionner un signe et examiner la demande Freighter avant de signer.
5. Attendre la confirmation, vérifier le résultat, le solde et le lien « Voir la transaction ». Il ouvre Stellar Lab sur Testnet avec le hash de la manche courante : statut, appel `play`, transferts et frais. Le lien « Dernière transaction » du menu utilise la même référence.

Le dashboard lit les données du RPC Stellar directement : une transaction confirmée peut être absente de l’index d’un explorateur tiers. Le lien reste soumis à la disponibilité et à la durée de conservation du RPC Testnet ; il ne constitue pas une archive permanente. Le mode démo ne génère aucun lien de transaction réelle.

Le paiement est automatique : victoire = 2 × la mise versés ; égalité = mise remboursée ; défaite = mise perdue. **Remiser** prépare une nouvelle transaction. Il n’existe pas de retrait séparé. Chaque manche, y compris après égalité, nécessite une signature et des frais éventuels.

Le front utilise le client `double-ou-rien-client` fourni par `bindings/`, qui exporte le SDK Stellar. Réseau et contrat viennent de `networks.testnet` dans ces bindings. **Ne pas modifier manuellement le client généré**. Après un redéploiement du back, récupérer les nouveaux bindings et `deployment.json`, les reconstruire, puis reconstruire le front. Résoudre les transactions en attente avant de changer de déploiement.

Contrôle Testnet en lecture seule, sans signer, créer de compte ou envoyer de transaction :

```powershell
node frontend/scripts/check-testnet.mjs
```

Il vérifie la cohérence du contrat configuré, l’accès RPC, le contrat déployé, le solde de la banque et la réserve réseau.

## Architecture et invariants

- `src/game.ts` : types, transitions et calculs exacts en `bigint` ; 1 XLM = 10 000 000 stroops.
- `src/adapters/demo.ts` : scénarios déterministes et paiements fictifs persistants.
- `src/adapters/stellar.ts` : Freighter, lecture du solde disponible après réserves/engagements, simulation, signature, envoi et suivi RPC.
- `src/storage.ts` : référence locale permettant la reprise. Aucune clé privée, phrase de récupération ou transaction signée n’est enregistrée.
- `src/App.tsx` et `src/components/` : menu, arène, illustrations SVG originales, rouleau et fenêtres accessibles.
- `src/styles.css` : composition PC, avec adaptation en hauteur, sans mise en page téléphone.

La simulation technique du contrat n’est utilisée que pour préparer la transaction et détecter les erreurs. Son résultat aléatoire n’est **jamais** révélé. Seule une réponse RPC `SUCCESS` fournit le résultat officiel.

Un verrou immédiat et Web Locks empêchent les envois concurrents depuis les onglets de la même origine. Le hash et le contexte sont enregistrés avant soumission. Une panne après envoi conserve cette référence ; une vérification ne renvoie pas la transaction. `NOT_FOUND` n’est pas considéré comme un échec immédiat. L’expiration est reconnue uniquement si les bornes de l’historique RPC permettent de la vérifier.

Revenir au menu avant envoi abandonne la préparation (fermer/refuser la fenêtre Freighter si elle est encore ouverte). Après envoi, le menu conserve le suivi et empêche une nouvelle manche jusqu’à résolution. Une actualisation affiche la manche à vérifier. Ne pas effacer les données du site pendant une opération en attente.

## Validation

```powershell
npm run test --prefix frontend
npm run build --prefix frontend
```

Les tests couvrent les neuf combinaisons, les conversions décimales, les paiements, les égalités répétées, les transitions, les scénarios de panne, le décodage des résultats avec les vrais bindings et la reprise RPC sans nouvel envoi.

Voir [la fiche de vérification](docs/validation.md) pour les contrôles de livraison et ce qui reste à faire sur le PC du jury.

La [fiche d’intégration](docs/integration.md) décrit les échanges déjà raccordés au contrat et les points à vérifier avec le développeur back.

## Limites explicites

- Prototype **Testnet uniquement**. Le mode démo ne se substitue jamais silencieusement au mode connecté.
- Le hasard `env.prng()` du back n’est pas un mécanisme sécurisé pour des mises réelles. Aucune promesse d’équité vérifiable.
- Une vérification RPC ne remplace pas un essai complet signé dans Freighter ; celui-ci doit être fait sur le poste de présentation.
- La reprise concerne le navigateur et l’origine qui ont envoyé la transaction. Aucun serveur ne synchronise les manches entre machines.
- Pas de multi-signature ni de restauration automatique du contrat expiré. Ces cas demandent une intervention du développeur back.
- Les commandes du front n’exécutent jamais le script de déploiement du back.
