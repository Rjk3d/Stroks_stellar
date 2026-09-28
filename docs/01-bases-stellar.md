# 01 — Les bases de Stellar

> Objectif : comprendre les briques sur lesquelles repose « Double ou Rien »,
> sans jargon inutile. Voir aussi le [glossaire](glossaire.md).

## 1. Stellar en une phrase

Stellar est une **blockchain publique** : un registre de comptes et de soldes, copié sur
des centaines de serveurs dans le monde, que personne ne peut modifier seul. Elle est
pensée pour les paiements rapides (≈ 5 secondes) et peu chers (une fraction de centime).
Depuis 2024, elle exécute aussi des **smart contracts** grâce à **Soroban**.

## 2. Ledgers : les « pages » du registre

Toutes les ~5 secondes, le réseau valide un nouveau **ledger** : un lot de transactions
acceptées par consensus (le *Stellar Consensus Protocol*). Chaque ledger a un numéro
croissant, le « ledger sequence ». Dans ce projet, ce numéro sert à :
- exprimer les durées de vie des données (TTL : `30 * 17_280` ledgers ≈ 30 jours) ;
- savoir où l'indexeur doit commencer à lire (`deployLedger` dans `deployment.json`).

## 3. Comptes et clés

Un compte Stellar = une **paire de clés** (cryptographie Ed25519) :

| | Format | Rôle | À partager ? |
|---|---|---|---|
| Clé publique | `G...` (56 caractères) | L'**adresse** du compte | ✅ oui |
| Clé secrète | `S...` | Sert à **signer** les transactions | ❌ JAMAIS |

Signer une transaction prouve mathématiquement que le propriétaire de l'adresse l'a
approuvée, sans révéler la clé secrète.

Dans ce projet :
- `alice` est une identité de la **CLI** (`stellar keys ...`). Elle déploie le contrat et en est l'admin ;
- `player1` est créé par `play-demo.js` pour jouer ;
- dans le **front**, les clés restent dans le portefeuille **Freighter** (une extension de
  navigateur). Le site ne voit jamais la clé secrète : il demande une signature.

Les **contrats** ont aussi une adresse, en `C...`.

## 4. XLM, stroops, réserves et frais

- **XLM** (le « lumen ») est la monnaie native du réseau.
- **1 XLM = 10 000 000 stroops.** Les contrats manipulent toujours des **entiers** en
  stroops, jamais des nombres à virgule, car les flottants sont imprécis et non déterministes.
  C'est pourquoi on voit `10_000_000` partout dans le code.
- **Frais** : chaque transaction paie des frais (en stroops). Pour un smart contract, ils
  ont deux parties :
  - des **frais d'inclusion**, pour passer dans un ledger ;
  - des **frais de ressources** : CPU, lectures et écritures, taille des événements, et
    **loyer** des données stockées (voir TTL). Une partie de ces frais est *remboursable*
    si elle n'est pas utilisée.
- **Réserve minimale** : un compte doit garder un petit solde bloqué (1 XLM de base),
  pour éviter la création massive de comptes vides.

## 5. Testnet et Friendbot

| Réseau | Usage | Valeur des XLM |
|---|---|---|
| **Mainnet** (« Public ») | Production | Réelle |
| **Testnet** | Développement et démos | Aucune |
| Futurenet | Tester les futures versions du protocole | Aucune |

Le **testnet** est remis à zéro de temps en temps, et chaque réseau a sa propre
**passphrase** (`"Test SDF Network ; September 2015"`), incluse dans ce qui est signé.
Une transaction signée pour le testnet est donc invalide sur le mainnet.

**Friendbot** est un robot qui donne 10 000 XLM de test à n'importe quel compte du testnet.
C'est ce que fait `stellar keys generate player1 --network testnet --fund`.

## 6. RPC vs Horizon : deux API pour parler au réseau

| | **Stellar RPC** | **Horizon** |
|---|---|---|
| Pour quoi ? | **Smart contracts** (Soroban) | Comptes, paiements « classiques » |
| Simuler un appel de contrat | ✅ `simulateTransaction` | ❌ |
| Envoyer une transaction | ✅ `sendTransaction` | ✅ |
| Événements de contrat | ✅ `getEvents` (≈ 7 jours) | ❌ |
| Historique long | ❌ (mémoire courte) | ✅ (mais pas les événements Soroban) |
| URL testnet | `https://soroban-testnet.stellar.org` | `https://horizon-testnet.stellar.org` |

**Notre projet n'utilise que le RPC.** Sa mémoire courte des événements explique pourquoi
on a construit notre propre indexeur (voir `indexer/src/index.ts`).

## 7. Qu'est-ce qu'un smart contract ?

Un **smart contract** est un programme **stocké sur la blockchain** et exécuté par tous les
validateurs. Son code est public, personne ne peut le modifier après déploiement (sauf si
une fonction d'upgrade est prévue, ce qui n'est pas notre cas), et il peut détenir et
transférer de l'argent.

Notre contrat « Double ou Rien » **est la banque** : il détient les XLM et applique des
règles que personne ne peut contourner, pas même l'admin. Par exemple, `withdraw` refuse de
toucher à l'argent promis aux joueurs.

Particularités de **Soroban** :
- **Rust** comme langage ;
- chaque fonction reçoit un `Env`, sa porte d'accès au monde (stockage, hasard, autres contrats) ;
- les données ont une **durée de vie** (TTL) et un loyer : c'est le *state archival* ;
- même le XLM est manipulé via un contrat, le **SAC** (*Stellar Asset Contract*), qui
  expose `transfer`, `balance`, etc.

## 8. Compilation en WASM

```
src/lib.rs  ──cargo (via stellar contract build)──▶  double_ou_rien.wasm (15 Ko)  ──deploy──▶  testnet
```

- **WebAssembly (WASM)** est un format binaire compact, portable et **déterministe** : le
  même code donne le même résultat sur tous les validateurs, condition indispensable pour
  que tout le monde soit d'accord.
- La cible Rust `wasm32v1-none` produit un WASM sans système d'exploitation (d'où `#![no_std]`).
- `stellar contract build` compile en mode `release` et **optimise la taille**, car on paie
  selon la taille du code.
- Le WASM contient aussi l'**interface** du contrat (noms des fonctions, types, erreurs).
  C'est grâce à elle que `stellar contract bindings typescript` génère le client TypeScript
  sans qu'on écrive une ligne.

## 9. Le déploiement en pratique (ce que fait `scripts/deploy.js`)

1. `stellar contract build` compile en WASM.
2. `stellar contract id asset --asset native` donne l'adresse du contrat XLM.
3. `stellar contract deploy ... -- --admin ... --token ... --config ...` fait deux
   transactions : l'upload du code, puis la création d'une instance qui appelle `__constructor`.
4. `stellar contract invoke --id <XLM> -- transfer ...` : alice envoie 100 XLM à la banque.
5. Tous les identifiants sont écrits dans `deployment.json`.
