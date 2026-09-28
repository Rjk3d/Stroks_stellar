# 08 — Exercices progressifs

> Pour apprendre en modifiant le projet. Pour chaque exercice : **coder**, puis **écrire un
> test** dans `test.rs`, puis lancer `cargo test`. Les solutions sont repliées : essayez
> d'abord !
> ⚠️ Toute modification du contrat demande de redéployer (`npm run deploy`) puis de
> régénérer les bindings (`npm run bindings`).

---

## Exercice 1 ⭐ — Nouvelle lecture : `get_multiplier`
Ajoutez une fonction publique `get_multiplier(player) -> u32` qui renvoie le multiplicateur
actuel (1 s'il n'y a pas de partie).

<details><summary>💡 Indice</summary>

Réutilisez `read_game` et `nominal_multiplier`. `Option::map` transforme la valeur si elle
existe, et `unwrap_or` fournit la valeur par défaut.
</details>

<details><summary>✅ Solution</summary>

```rust
pub fn get_multiplier(env: Env, player: Address) -> u32 {
    read_game(&env, &player).map(|g| nominal_multiplier(g.wins)).unwrap_or(1)
}
```
Test : après une victoire, `assert_eq!(s.client.get_multiplier(&s.player), 2);`
</details>

---

## Exercice 2 ⭐⭐ — Réintroduire un avantage maison
Ajoutez `payout_bps: u32` à `Config` (10000 = x2, 9500 = x1,9) et appliquez-le à chaque
victoire. Validez que `1 <= payout_bps <= 10000`.

<details><summary>💡 Indice</summary>

Multipliez **avant** de diviser pour ne pas perdre de précision : `pot * 2 * bps / 10000`.
Pensez à la conversion `as i128`. Mettez à jour `doubled_pot`, `validate_config`, les tests
et `deploy.js`.
</details>

<details><summary>✅ Solution</summary>

```rust
fn doubled_pot(pot: i128, payout_bps: u32) -> i128 {
    pot * 2 * (payout_bps as i128) / 10_000
}
// validate_config : && config.payout_bps >= 1 && config.payout_bps <= 10_000
// play_round : let pot_if_win = doubled_pot(game.pot, config.payout_bps);  (passer &config en paramètre)
```
Test : avec 9500, une mise de 10 XLM gagnante donne un pot de 19 XLM, puis 36,1 XLM.
**Maths** : espérance par tour décisif = 0,5 × 1,9 − 1 = **−5 %** pour le joueur.
</details>

---

## Exercice 3 ⭐⭐ — Bonus de série
Si un joueur **encaisse** 3 parties d'affilée (sans défaite entre elles), il reçoit un bonus
de 10 % sur le 3ᵉ encaissement.

<details><summary>💡 Indice</summary>

Ajoutez `streak: u32` dans `Stats`. `cash_out` l'incrémente et une défaite le remet à 0.
Vérifiez que la banque peut payer le bonus (sinon, pas de bonus). N'oubliez pas de mettre à
jour `reserved` : le bonus n'y était pas.
</details>

<details><summary>✅ Solution</summary>

```rust
// Stats : pub streak: u32,
// play_round, branche Loss :  stats.streak = 0;
// cash_out :
let mut stats = read_stats(&env, &player);
stats.streak += 1;
let mut payout = game.pot;
if stats.streak % 3 == 0 {
    let bonus = game.pot / 10;
    // bonus payé seulement si la banque a de quoi, hors argent réservé
    if bank_balance(&env) - read_reserved(&env) >= bonus {
        payout += bonus;
    }
}
token_client(&env).transfer(&env.current_contract_address(), &player, &payout);
```
</details>

---

## Exercice 4 ⭐⭐ — Jackpot progressif
Chaque mise alimente un jackpot à hauteur de 1 %. Un joueur qui atteint x32 remporte le
jackpot en plus de son pot.

<details><summary>💡 Indice</summary>

Nouvelle clé d'instance `DataKey::Jackpot`. Dans `start`, ajoutez `bet / 100` au jackpot.
Le jackpot fait partie de ce que la banque « doit » : ajoutez-le à `reserved`, sinon
`withdraw` pourrait le prendre. Dans `cash_out`, si `nominal_multiplier(wins) == 32`,
versez-le et remettez-le à 0. Émettez un événement `JackpotWon`.
</details>

<details><summary>✅ Solution</summary>

```rust
// start, après le transfert :
let contribution = bet / 100;
let jackpot: i128 = env.storage().instance().get(&DataKey::Jackpot).unwrap_or(0);
env.storage().instance().set(&DataKey::Jackpot, &(jackpot + contribution));
write_reserved(&env, read_reserved(&env) + bet + contribution);

// cash_out :
let mut payout = game.pot;
if nominal_multiplier(game.wins) == 32 {
    let jackpot: i128 = env.storage().instance().get(&DataKey::Jackpot).unwrap_or(0);
    payout += jackpot;
    env.storage().instance().set(&DataKey::Jackpot, &0i128);
    write_reserved(&env, read_reserved(&env) - jackpot);
    JackpotWon { player: player.clone(), amount: jackpot }.publish(&env);
}
```
Question bonus : la contribution de 1 % vient de la banque et non du joueur. Qui paie
vraiment le jackpot ?
</details>

---

## Exercice 5 ⭐⭐ — Expiration des parties abandonnées
Une partie gagnante non jouée depuis 7 jours peut être encaissée par **n'importe qui**, au
profit du joueur, pour libérer la réserve.

<details><summary>💡 Indice</summary>

Stockez `last_ledger: u32` dans `Game` (`env.ledger().sequence()`). Nouvelle fonction
`force_cash_out(player)` **sans** `require_auth`, qui vérifie
`env.ledger().sequence() > last_ledger + 7 * 17_280`. En test :
`env.ledger().with_mut(|l| l.sequence_number += 8 * 17_280)`.
</details>

<details><summary>✅ Solution</summary>

```rust
pub fn force_cash_out(env: Env, player: Address) -> Result<i128, Error> {
    let game = read_game(&env, &player).ok_or(Error::NoGameInProgress)?;
    if env.ledger().sequence() <= game.last_ledger + 7 * DAY_IN_LEDGERS {
        return Err(Error::GameNotExpired); // nouveau code 11
    }
    // ... même logique de paiement que cash_out (factoriser dans une fonction interne !)
}
```
</details>

---

## Exercice 6 ⭐⭐⭐ — Indexeur : statistiques globales
Ajoutez `GET /stats` à l'indexeur : nombre de parties, total misé, total gagné par les
joueurs, taux de victoire par coup (Pierre, Feuille, Ciseaux).

<details><summary>💡 Indice</summary>

Tout est dans la table `events`. `json_extract(data, '$.player_move')` lit un champ du JSON
stocké. `GROUP BY` agrège.
</details>

<details><summary>✅ Solution</summary>

```ts
// db.ts
globalStats() {
  const totals = db.prepare(`SELECT
      SUM(CASE WHEN type='round_played' AND json_extract(data,'$.rounds')=1 THEN 1 ELSE 0 END) AS games,
      SUM(CASE WHEN type='cashed_out' THEN amount ELSE 0 END) AS paidOut
    FROM events`).get();
  const byMove = db.prepare(`SELECT json_extract(data,'$.player_move') AS move,
      COUNT(*) AS rounds, SUM(outcome='Win') AS wins
    FROM events WHERE type='round_played' GROUP BY move`).all();
  return { totals, byMove };
}
// api.ts
app.get("/stats", (_req, res) => res.json(db.globalStats()));
```
</details>

---

## Exercice 7 ⭐⭐⭐⭐ — Joueur contre joueur en commit-reveal
Deux joueurs misent la même somme. Chacun **s'engage** sur son coup sans le révéler, puis
chacun le révèle. Le gagnant empoche tout (égalité : chacun récupère sa mise).
Le hasard n'est plus nécessaire, ce qui supprime la faille du PRNG (voir docs/06).

<details><summary>💡 Indice</summary>

1. `create_duel(p1, commit1: BytesN<32>, bet)`, où `commit = sha256(coup ‖ sel)` est calculé
   **côté client** ;
2. `join_duel(duel_id, p2, commit2)` ;
3. `reveal(duel_id, player, coup: Move, salt: BytesN<32>)` : le contrat recalcule
   `env.crypto().sha256(...)` et compare au commit ;
4. une fois les 2 coups révélés, on paie. Délai : si un joueur ne révèle pas avant N ledgers,
   l'autre gagne par forfait (sinon le perdant ne révèlerait jamais).

Le **sel** empêche de deviner le coup à partir du hash : sans sel, il n'y a que 3 hash possibles !
</details>

<details><summary>✅ Solution (squelette)</summary>

```rust
#[contracttype]
pub struct Duel {
    pub p1: Address, pub p2: Option<Address>, pub bet: i128,
    pub commit1: BytesN<32>, pub commit2: Option<BytesN<32>>,
    pub move1: Option<Move>, pub move2: Option<Move>,
    pub deadline: u32,
}

fn commitment(env: &Env, mv: Move, salt: &BytesN<32>) -> BytesN<32> {
    let mut data = Bytes::new(env);
    data.push_back(mv as u8);
    data.append(&Bytes::from(salt.clone()));
    env.crypto().sha256(&data).into()
}

pub fn reveal(env: Env, duel_id: u32, player: Address, mv: Move, salt: BytesN<32>) -> Result<(), Error> {
    player.require_auth();
    let mut duel: Duel = /* lire DataKey::Duel(duel_id) */;
    let expected = if player == duel.p1 { duel.commit1.clone() } else { duel.commit2.clone().unwrap() };
    if commitment(&env, mv, &salt) != expected { return Err(Error::BadReveal); }
    // enregistrer le coup ; si les deux sont connus → comparer avec Move::beats et payer
    Ok(())
}
```
</details>

---

## Exercice 8 ⭐⭐⭐ — Front minimal
Avec [05-integration-front.md](05-integration-front.md), créez une page Vite + TypeScript
qui affiche `get_bank`, connecte Freighter et joue un `start`.

<details><summary>💡 Indice</summary>

`npm create vite@latest front -- --template vanilla-ts`, puis
`npm install ../bindings @stellar/freighter-api`, et copiez `readClient`, `connectWallet`,
`addResourceMargin` et `sendTx` depuis le doc 05.
</details>

<details><summary>✅ Solution (main.ts)</summary>

```ts
import { Move } from "double-ou-rien-client";
import { readClient, connectWallet, sendTx } from "./stellar";   // code du doc 05

const XLM = 10_000_000n;
const out = document.querySelector("#out")!;
const { result: bank } = await readClient.get_bank();
out.textContent = `Banque : ${Number(bank.available) / 1e7} XLM disponibles`;

document.querySelector("#play")!.addEventListener("click", async () => {
  const { address, client } = await connectWallet();
  try {
    const outcome = await sendTx(client.start({ player: address, player_move: Move.Rock, bet: XLM }));
    out.textContent = ["Gagné !", "Égalité", "Perdu"][outcome];
  } catch (e) {
    out.textContent = (e as Error).message;
  }
});
```
</details>
