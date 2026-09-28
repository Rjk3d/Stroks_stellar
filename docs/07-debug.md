# 07 — Debug : erreurs fréquentes et solutions

> Ce document est un **journal de bord**. Chaque erreur marquée 🔴 a été
> rencontrée pour de vrai pendant la construction du projet ; les autres (🟡)
> sont des erreurs classiques que vous croiserez probablement.

---

## Environnement Windows

### 🔴 `stellar` / `cargo` : « n'est pas reconnu comme nom d'applet de commande »
**Cause** : le programme est installé mais son dossier n'est pas dans le `PATH` du terminal
(fréquent dans un terminal ouvert AVANT l'installation, ou dans un outil qui a son propre environnement).
**Solution** :
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;C:\Program Files (x86)\Stellar CLI;$env:Path"
```
Pour que ce soit permanent : fermer/rouvrir le terminal, ou ajouter ces dossiers
dans « Modifier les variables d'environnement système ». Nos scripts Node cherchent
de toute façon `stellar` dans ce dossier par défaut (voir `scripts/lib/stellar-cli.js`).

### 🔴 `linker 'link.exe' not found` / `msvcrt.lib` introuvable
**Contexte** : `cargo test` compile le contrat **pour votre PC** (pas en WASM), et
Rust a besoin d'un « linker » (l'outil qui assemble l'exécutable final). La toolchain
Rust par défaut sous Windows (`x86_64-pc-windows-msvc`) utilise celui de Visual Studio,
qui exige la charge de travail « Développement Desktop en C++ » **et** le Windows SDK.
**Solution retenue dans ce projet** : la toolchain GNU, qui embarque son propre linker :
```powershell
rustup toolchain install stable-x86_64-pc-windows-gnu --profile minimal --target wasm32v1-none
rustup override set stable-x86_64-pc-windows-gnu   # uniquement pour ce dossier
```
**Alternative** : Visual Studio Installer → Modifier → cocher « Développement Desktop en C++ ».
> Le WASM du contrat, lui, n'a jamais besoin de ce linker (Rust utilise `rust-lld`).

### 🔴 `link: extra operand ...` dans Git Bash
**Cause** : dans Git Bash, la commande Unix `link` (`/usr/bin/link`) masque `link.exe` de Visual Studio.
**Solution** : lancer `cargo` depuis **PowerShell**, pas depuis Git Bash.

---

## Tests du contrat

### 🔴 `HostError: Error(Auth, ExistingValue)` — « nonce already exists for address »
**Contexte** : pour contrôler le hasard, on fixe la graine avec
`env.host().set_base_prng_seed(seed)`. Or ce PRNG de base sert aussi à générer les
*nonces* (numéros anti-rejeu) des autorisations simulées par `mock_all_auths()`.
En remettant **la même graine** avant chaque appel, deux appels successifs du même
joueur recevaient le même nonce → le réseau refuse (protection contre le rejeu).
**Solution** : une graine différente à chaque tirage (compteur `seed_counter` dans `test.rs`).
**Leçon** : un nonce sert précisément à empêcher de rejouer deux fois la même signature.

### 🔴 `env.events().all()` renvoie `[]` alors que l'événement a été émis
**Cause** : `events().all()` ne contient que les événements du **dernier appel** au
contrat. Si on appelle `get_game()` entre temps, la liste est celle de `get_game` (vide).
**Solution** : capturer `let events = env.events().all()...` **juste après** l'appel testé.

### 🟡 `Err(Ok(Error::X))` vs `Err(Err(...))` avec les fonctions `try_...`
- `Ok(Ok(valeur))` : succès.
- `Err(Ok(Error::X))` : le contrat a renvoyé **notre** erreur X.
- `Err(Err(e))` : erreur du **réseau** (autorisation manquante, panique, budget dépassé...).

### 🟡 Dossier `test_snapshots/`
Le SDK écrit un instantané JSON de chaque test. C'est normal ; il est ignoré par git.

---

## Bindings et scripts

### 🔴 `os error 32` pendant `npm run bindings`
« Le processus ne peut pas accéder au fichier car ce fichier est utilisé par un autre processus. »
**Cause** : `--overwrite` supprime le dossier `bindings/`, mais un fichier y était ouvert
(un terminal positionné dans le dossier, VS Code, ou **OneDrive** en pleine synchronisation).
**Solution** : sortir de ce dossier dans tous les terminaux, puis relancer. Si ça persiste,
mettre OneDrive en pause pendant la génération.

### 🔴 `Cannot read properties of null (reading 'wins')`
**Cause** : `get_game` renvoie `Option<Game>`. Côté JS, `None` devient **`null`** (pas `undefined`).
**Solution** : tester `if (game == null)` (le double `==` couvre null ET undefined).

---

## Transactions qui échouent on-chain (le piège n°1 d'un jeu de hasard)

### 🔴 `invokeHostFunctionResourceLimitExceeded` / `invokeHostFunctionInsufficientRefundableFee`
**Symptôme** : `start` ou `play` échoue **au hasard** (une fois sur trois environ), alors que
la simulation disait « OK ». Le SDK ne lève pas toujours d'exception : il faut vérifier
`sent.getTransactionResponse.status === "SUCCESS"`.

**Cause** : avant l'envoi, le SDK **simule** la transaction. La simulation mesure les
ressources consommées (CPU, octets lus et écrits, loyer des données, événements) et ces
mesures deviennent des **limites** dans la transaction signée. Or **le PRNG de la
simulation n'est pas celui du vrai ledger** : la simulation peut tirer « égalité » quand le
vrai tour tire « défaite ». Si le vrai chemin coûte plus cher, les limites sont dépassées.

**Comment on l'a diagnostiqué** : en décodant la transaction échouée
(`rpc.Server.getTransaction(hash)`, puis `resultXdr` et `envelopeXdr.sorobanData()`).
On y voyait :
1. `ResourceLimitExceeded` : le vrai chemin demandait plus de CPU que prévu ;
2. `InsufficientRefundableFee` : la simulation tirait « défaite » (la partie était **effacée**,
   aucun loyer à payer) alors que le vrai tour était une victoire (la partie était **écrite
   pour 30 jours**, loyer à payer).

**Solution en 2 parties** :
1. **Côté contrat, la « règle d'or »** : chaque issue fait **exactement les mêmes écritures**
   (Game, Reserved, Stats). Une partie perdue n'est plus effacée : elle est écrite avec
   `pot = 0`, ce qui veut dire « terminée » (voir `play_round` et `read_game` dans `lib.rs`).
2. **Côté client, une marge de ressources** : `scripts/lib/resource-margin.js` relève les
   limites de CPU et les frais de ressources. La part remboursable non utilisée est rendue.

### 🔴 La marge de ressources « ne marche pas » (elle est ignorée)
**Cause** : on avait modifié `tx.built`, mais `signAndSend()` → `sign()` **reconstruit** la
transaction à partir des données de simulation mises en cache (`simulationData`).
**Solution** : modifier `tx.simulation.transactionData` (un `SorobanDataBuilder`) **avant**
le premier accès à `tx.result`, qui déclenche la mise en cache.
**Leçon** : quand un comportement est bizarre, lire le code source de la bibliothèque dans
`node_modules` (ici `@stellar/stellar-sdk/lib/esm/contract/assembled_transaction.js`).

## Indexeur

### 🔴 Console illisible : `ðŸš€ Indexeur ... Ã©vÃ©nement(s)`
**Cause** : le terminal (ou le fichier de log) lit l'UTF-8 comme du Windows-1252.
**Solution** : c'est purement cosmétique. Dans PowerShell : `chcp 65001`, ou lire le log
avec `Get-Content fichier -Encoding UTF8`.

### 🔴 Première requête `/health` : « Impossible de se connecter au serveur distant »
**Cause** : la requête est partie avant que le serveur ait fini de démarrer.
**Solution** : attendre la ligne `🚀 Indexeur de ...` avant d'interroger l'API.

### 🟡 `startLedger must be between the oldest ledger ... and the latest ledger`
**Cause** : le ledger de départ est plus vieux que la rétention du RPC (~7 jours).
**Solution** : déjà gérée (départ automatique à `oldestLedger`, avec un avertissement). Si un
**cursor** sauvegardé est trop vieux, supprimer `indexer/data/<contractId>.sqlite` pour
repartir de zéro (les événements plus anciens que 7 jours seront perdus).

### 🟡 `ExperimentalWarning: SQLite is an experimental feature`
Selon la version de Node, `node:sqlite` affiche cet avertissement. Il est sans conséquence.

### 🟡 L'indexeur n'affiche rien après un redéploiement
Il lit `deployment.json` **au démarrage** : il faut le relancer après `npm run deploy`. Une
nouvelle base est créée automatiquement, puisqu'il y en a une par contractId.

---

## CLI Stellar

### 🟡 `error: unexpected argument '--global'`
Depuis la CLI v23 environ, `stellar keys ... --global` n'existe plus : les identités sont
toujours globales (dans `~/.config/stellar`). Il suffit de retirer l'option.

### 🟡 `Error(Contract, #N)` dans la CLI
C'est notre enum `Error` : voir le tableau dans [03-le-contrat-explique.md](03-le-contrat-explique.md#4-errorsrs--les-codes-derreur).

### 🟡 `Error(Auth, InvalidAction)` ou `require_auth` qui échoue
La transaction n'est pas signée par la bonne adresse. Par exemple `withdraw` avec
`--source-account player1` alors que l'admin est `alice`.
