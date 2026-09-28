# 🎰 Double ou Rien — Stellar / Soroban (partie back)

Pierre-feuille-ciseaux façon casino contre une banque qui est un **smart contract** Stellar.
Le joueur mise des XLM de test ; chaque victoire **double** son pot. Il peut rejouer tout le
pot (x2 → x4 → x8…) ou encaisser. Égalité : on rejoue. Défaite : la banque garde tout.

```
contracts/double-ou-rien/   contrat Rust (Soroban) + 18 tests
scripts/                    deploy.js, bindings.js, play-demo.js (Node, compatibles Windows)
bindings/                   client TypeScript généré → à donner au front
indexer/                    indexeur d'événements + API REST (Node 24, SQLite intégré)
docs/                       documentation pédagogique (commencez par 01)
deployment.json             IDs du déploiement courant (généré)
```

## Prérequis

- Rust + la cible `wasm32v1-none`, [Stellar CLI](https://developers.stellar.org/docs/tools/cli) v28, **Node.js 24+**
- Une identité CLI `alice` financée sur le testnet : `stellar keys generate alice --network testnet --fund`
- **Windows** : si `cargo test` réclame `link.exe`, voir [docs/07-debug.md](docs/07-debug.md).
  Ce dossier utilise la toolchain GNU (`rustup override set stable-x86_64-pc-windows-gnu`).
- Si `stellar` ou `cargo` ne sont pas reconnus dans PowerShell :
  `$env:Path = "$env:USERPROFILE\.cargo\bin;C:\Program Files (x86)\Stellar CLI;$env:Path"`

## Démarrage rapide (PowerShell, à la racine)

```bash
cargo test
```
Lance les 18 tests unitaires du contrat.

```bash
npm run deploy
```
Compile le contrat, le déploie sur le testnet avec alice, finance la banque (100 XLM) et
écrit `deployment.json`.

```bash
npm run bindings
```
Génère et compile le client TypeScript dans `/bindings`.

```bash
npm run demo
```
Joue une vraie partie : mise de 1 XLM, encaissement à x2. `npm run demo -- 2 8` mise
2 XLM et vise x8.

```bash
npm install --prefix indexer
```
Installe les dépendances de l'indexeur (une seule fois).

```bash
npm run indexer
```
Lance l'API sur http://localhost:3001 : `/health`, `/history/:address`, `/leaderboard`.

## Le contrat en bref

| Fonction | Qui | Rôle |
|---|---|---|
| `start(player, player_move, bet)` | joueur | mise et 1er tour → `Outcome` |
| `play(player, player_move)` | joueur | remet tout le pot en jeu → `Outcome` |
| `cash_out(player)` | joueur | encaisse → montant |
| `get_game` / `get_stats` / `get_config` / `get_bank` | tous | lectures gratuites |
| `withdraw(amount)` / `set_config(config)` | admin | gestion de la banque |

Codes d'erreur, maths du jeu et diagramme d'états : [docs/03](docs/03-le-contrat-explique.md).

## Documentation

1. [Bases de Stellar](docs/01-bases-stellar.md)
2. [Rust pour Soroban](docs/02-rust-pour-soroban.md)
3. [Le contrat expliqué](docs/03-le-contrat-explique.md)
4. [Cycle d'une transaction](docs/04-cycle-transaction.md)
5. [**Intégration front**](docs/05-integration-front.md) ← pour le développeur front
6. [Sécurité](docs/06-securite.md)
7. [Debug : erreurs rencontrées](docs/07-debug.md)
8. [Exercices](docs/08-exercices.md)
9. [Pitch hackathon](docs/09-pitch-hackathon.md)
10. [Glossaire](docs/glossaire.md)

## Dépendances (et pourquoi)

| Dépendance | Où | Pourquoi |
|---|---|---|
| `soroban-sdk` 28 | contrat | le SDK officiel des contrats Stellar (seule dépendance Rust) |
| `double-ou-rien-client` (local) | scripts | les bindings générés ; ré-exportent `@stellar/stellar-sdk` |
| `@stellar/stellar-sdk` 17 | indexeur | client RPC (`getEvents`) et décodage XDR (`scValToNative`) |
| `express` | indexeur | serveur HTTP minimaliste, le plus répandu |
| `cors` | indexeur | autoriser le front (autre port) à appeler l'API |
| `typescript` + `@types/*` (dev) | indexeur | vérification de types uniquement (`npm run typecheck`) |
| SQLite (`node:sqlite`) | indexeur | **intégré à Node 24** : aucune installation ni compilation |
