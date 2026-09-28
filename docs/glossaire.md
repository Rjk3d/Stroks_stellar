# Glossaire

| Terme | Définition |
|---|---|
| **Adresse** | Identifiant public : `G...` pour un compte, `C...` pour un contrat. |
| **Archivage (state archival)** | Quand le TTL d'une donnée tombe à 0, elle est archivée : illisible jusqu'à un `restore`. |
| **AssembledTransaction** | Objet du SDK JS renvoyé par chaque appel du client : transaction construite + simulée, prête à signer. |
| **Bindings** | Client TypeScript généré automatiquement depuis l'interface du contrat (`/bindings`). |
| **Commit-reveal** | Technique en 2 temps : publier `hash(secret)`, puis révéler le secret. Empêche de tricher sur une valeur choisie à l'avance. |
| **Constructeur** | `__constructor` : fonction exécutée une seule fois, au déploiement. |
| **CORS** | Règle des navigateurs qui bloque les appels vers un autre domaine, sauf autorisation du serveur. |
| **Cursor** | Marque-page renvoyé par `getEvents` pour reprendre la lecture là où on s'était arrêté. |
| **Env** | Paramètre de chaque fonction du contrat : accès au stockage, au hasard, aux événements... |
| **Événement** | Message publié par un contrat, lisible hors chaîne via le RPC (topics + data). |
| **Footprint** | Liste des données qu'une transaction Soroban lit et écrit, déclarée à l'avance. |
| **Freighter** | Portefeuille Stellar sous forme d'extension de navigateur ; signe les transactions. |
| **Friendbot** | Service qui donne des XLM de test sur le testnet. |
| **Horizon** | Ancienne API de Stellar pour les comptes et les paiements. Non utilisée ici. |
| **i128 / u32 / u64** | Types entiers Rust : signé 128 bits, non signé 32 bits, non signé 64 bits. |
| **Indexeur** | Programme qui lit les événements et les range dans une base interrogeable. |
| **Instance (stockage)** | Stockage global d'un contrat, un seul TTL partagé. Chez nous : config, admin, token, réserve. |
| **Ledger** | « Bloc » de Stellar, validé toutes les ~5 s, numéroté. |
| **Loyer (rent)** | Frais payés pour garder une donnée stockée pendant une durée (TTL). |
| **Nonce** | Numéro à usage unique qui empêche de rejouer une signature. |
| **Option** | Type Rust « une valeur ou rien » : `Some(x)` / `None`. `None` devient `null` en JS. |
| **Ownership / emprunt** | Règle Rust : une valeur a un propriétaire ; `&` prête en lecture, `&mut` en écriture. |
| **Passphrase réseau** | Texte identifiant un réseau, inclus dans les signatures. |
| **Persistent (stockage)** | Stockage par clé avec un TTL individuel, restaurable. Chez nous : parties, stats. |
| **Polling** | Interroger régulièrement un service pour détecter du nouveau. |
| **PRNG** | Générateur pseudo-aléatoire (`env.prng()`). Pas sûr contre un attaquant. |
| **Reserved** | Dans notre contrat : somme des pots promis aux joueurs, intouchable par l'admin. |
| **require_auth** | Exige que l'adresse ait autorisé (signé) l'appel. |
| **Result** | Type Rust `Ok(valeur)` / `Err(erreur)` ; les erreurs sont des valeurs. |
| **RPC (Stellar RPC)** | API pour simuler, envoyer des transactions Soroban et lire les événements. |
| **SAC** | *Stellar Asset Contract* : contrat qui expose un actif (ici le XLM) avec l'interface token. |
| **SEP-41** | Standard d'interface des tokens Soroban (`transfer`, `balance`...). |
| **Simulation** | Exécution « à blanc » d'une transaction par le RPC, pour obtenir résultat, footprint et frais. |
| **Soroban** | La plateforme de smart contracts de Stellar. |
| **Stroop** | Plus petite unité : 1 XLM = 10 000 000 stroops. |
| **Testnet** | Réseau de test, XLM sans valeur. |
| **Topic** | Champ indexable d'un événement (ici : nom de l'événement + joueur). |
| **TTL** | *Time To Live* : durée de vie restante d'une donnée, en ledgers. |
| **WASM** | WebAssembly : format binaire dans lequel le contrat Rust est compilé. |
| **XDR** | Format binaire d'encodage de toutes les données Stellar. |
| **XLM** | Le lumen, monnaie native de Stellar. |
