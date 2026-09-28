# 09 — Pitch hackathon (3 minutes)

## Déroulé

| Temps | Contenu | Support |
|---|---|---|
| 0:00 – 0:20 | **Accroche** | « Qui a déjà voulu vérifier qu'un casino en ligne ne triche pas ? Impossible : le code est caché. » |
| 0:20 – 0:50 | **La solution** | « Double ou Rien » : pierre-feuille-ciseaux contre une banque qui est un **smart contract** Stellar. Les règles sont publiques, les fonds sont dans le contrat, même nous ne pouvons pas tricher. |
| 0:50 – 1:50 | **Démo live** | `npm run demo` (ou le front) : mise → victoire → pot x2 → rejouer ou encaisser. Montrer la transaction sur **stellar.expert**, puis `/leaderboard` de l'indexeur. |
| 1:50 – 2:30 | **Technique** | 3 briques : contrat Rust/Soroban (18 tests), bindings TypeScript générés, indexeur SQLite. Un point fort à raconter : la « règle d'or » des contrats à hasard (voir plus bas). |
| 2:30 – 2:50 | **Honnêteté sécurité** | « Le hasard on-chain est manipulable ; en production : commit-reveal. » (docs/06) |
| 2:50 – 3:00 | **Conclusion** | « Un casino où la confiance vient du code, pas de l'opérateur. » |

**Préparer avant** : l'indexeur lancé, un compte `player1` financé, le contrat déployé avec
une banque bien remplie, stellar.expert ouvert dans un onglet. Et un **plan B** : une vidéo
de la démo si le réseau tombe.

## L'histoire technique à raconter (notre meilleur argument)

> « Pendant les tests sur le testnet, une transaction sur trois échouait au hasard. En
> décodant les transactions échouées, on a compris : Soroban **simule** chaque transaction
> pour mesurer ses ressources, mais le hasard de la simulation n'est pas celui du vrai
> bloc. La simulation voyait une égalité, le vrai bloc une défaite, plus coûteuse : la
> limite était dépassée. On a corrigé à deux niveaux : dans le contrat, toutes les issues
> écrivent exactement les mêmes données ; côté client, on ajoute une marge de ressources,
> remboursée si elle n'est pas utilisée. Résultat : 38 transactions d'affilée, 0 échec. »

Cela montre qu'on a compris le **modèle d'exécution** de Soroban, pas juste suivi un tutoriel.

## Questions probables du jury et réponses

**Q : Comment le contrat génère-t-il le hasard ? Est-ce sûr ?**
R : Avec `env.prng()`, le PRNG fourni par le réseau. Ce n'est **pas** sûr contre un
attaquant : un contrat peut appeler le nôtre et annuler sa transaction quand il perd. En
double ou rien, c'est pire, car il enchaînerait les x2 sans risque. La solution est le
commit-reveal ou un oracle VRF. Nous l'avons documenté mais pas implémenté, par choix de
périmètre.

**Q : Que se passe-t-il si la banque n'a pas assez d'argent ?**
R : Avant chaque tour, le contrat vérifie qu'il pourrait payer le pot doublé **en plus** de
tout ce qu'il doit déjà aux autres joueurs (la variable `reserved`). Sinon, il refuse le tour
avec l'erreur 5. La banque ne peut jamais faire défaut.

**Q : L'admin peut-il partir avec la caisse ?**
R : Seulement avec les fonds **libres**. `withdraw` refuse de toucher à `reserved`, l'argent
promis aux joueurs. C'est vérifiable dans le code public.

**Q : Pourquoi Stellar/Soroban plutôt qu'Ethereum ?**
R : Des frais de l'ordre du centime, une confirmation en ~5 s, le XLM natif utilisable
directement comme un token (SAC), et Rust, un langage qui empêche beaucoup de bugs dès la
compilation (dépassements, mémoire).

**Q : Pourquoi un indexeur si tout est sur la blockchain ?**
R : Le RPC ne garde les événements que ~7 jours et ne sait pas faire de requêtes comme
« top 10 des gains ». Le contrat ne peut pas non plus parcourir tous les joueurs à un coût
raisonnable. L'indexeur lit les événements et les range en SQL. La blockchain reste la
source de vérité : on peut reconstruire la base.

**Q : C'est quoi le TTL dont vous parlez ?**
R : Sur Stellar, les données stockées paient un loyer pour une durée limitée. Notre contrat
prolonge automatiquement ses données de 30 jours à chaque utilisation. Si le jeu n'est pas
utilisé pendant un mois, il faut le « restaurer », mais rien n'est perdu.

**Q : Le jeu est-il rentable pour la banque ?**
R : Non, par choix : il est **équitable**, avec une espérance nulle (50 % de chances de
doubler, en ignorant les égalités). Un avantage maison se configurerait en une ligne, par
exemple un paiement de x1,9 au lieu de x2 (exercice 2).

**Q : Comment avez-vous testé ?**
R : 18 tests unitaires Rust dans un réseau simulé, où l'on contrôle le hasard en fixant la
graine du PRNG. Puis de vraies parties sur le testnet via les bindings, avec tous les
chemins couverts : égalité, victoire, défaite, encaissement x8.

**Q : Pourquoi une seule partie par joueur ?**
R : Pour la simplicité et la sécurité : l'état d'un joueur est une seule entrée de stockage,
facile à vérifier, et il n'y a pas d'ambiguïté sur la partie visée par `play`.

**Q : Qu'est-ce que `require_auth` ?**
R : C'est la vérification que l'adresse passée en paramètre a bien signé. Sans elle,
n'importe qui pourrait jouer avec l'argent d'un autre.
