// =============================================================================
// Tests : `cargo test`. Ils tournent sur une fausse blockchain en mémoire.
// =============================================================================

extern crate std;

use super::*;
use soroban_sdk::testutils::Address as _;

const XLM: i128 = 10_000_000; // 1 XLM en stroops

/// Prépare une blockchain de test : un faux XLM, le contrat, une banque
/// avec `bank_funds` et un joueur avec 100 XLM.
fn setup(bank_funds: i128) -> (Env, DoubleOuRienClient<'static>, token::Client<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths(); // toutes les signatures sont acceptées

    let issuer = Address::generate(&env);
    let xlm = env.register_stellar_asset_contract_v2(issuer).address();
    let bank = env.register(DoubleOuRien, (&xlm,)); // déploie + appelle __constructor
    let player = Address::generate(&env);

    token::StellarAssetClient::new(&env, &xlm).mint(&bank, &bank_funds);
    token::StellarAssetClient::new(&env, &xlm).mint(&player, &(100 * XLM));

    let client = DoubleOuRienClient::new(&env, &bank);
    let xlm_client = token::Client::new(&env, &xlm);
    // `env` est "déplacé" dans le tuple : on doit avoir fini de l'utiliser avant.
    (env, client, xlm_client, bank, player)
}

/// Contrôler le hasard : on fixe la graine du générateur, on regarde quel coup
/// la banque va jouer, puis on remet la même graine pour la vraie partie.
fn next_bank_move(env: &Env, bank: &Address) -> Move {
    env.host().set_base_prng_seed([42; 32]).unwrap();
    let bank_move = env.as_contract(bank, || match env.prng().gen_range::<u64>(0..=2) {
        0 => Move::Rock,
        1 => Move::Paper,
        _ => Move::Scissors,
    });
    env.host().set_base_prng_seed([42; 32]).unwrap();
    bank_move
}

/// Le coup qui bat `m`.
fn winner_against(m: Move) -> Move {
    match m {
        Move::Rock => Move::Paper,
        Move::Paper => Move::Scissors,
        Move::Scissors => Move::Rock,
    }
}

#[test]
fn win_doubles_the_bet() {
    let (env, client, xlm, bank, player) = setup(100 * XLM);
    let my_move = winner_against(next_bank_move(&env, &bank));

    let round = client.play(&player, &my_move, &(10 * XLM));

    assert_eq!(round.outcome, Outcome::Win);
    assert_eq!(round.payout, 20 * XLM);
    assert_eq!(xlm.balance(&player), 110 * XLM); // 100 - 10 + 20
    assert_eq!(xlm.balance(&bank), 90 * XLM);
}

#[test]
fn loss_goes_to_the_bank() {
    let (env, client, xlm, bank, player) = setup(100 * XLM);
    let bank_move = next_bank_move(&env, &bank);
    // Le coup qui PERD contre la banque = celui que le coup de la banque bat.
    let my_move = winner_against(winner_against(bank_move));

    let round = client.play(&player, &my_move, &(10 * XLM));

    assert_eq!(round.outcome, Outcome::Loss);
    assert_eq!(round.payout, 0);
    assert_eq!(xlm.balance(&player), 90 * XLM);
    assert_eq!(xlm.balance(&bank), 110 * XLM);
}

#[test]
fn tie_refunds_the_player() {
    let (env, client, xlm, bank, player) = setup(100 * XLM);
    let my_move = next_bank_move(&env, &bank); // même coup que la banque

    let round = client.play(&player, &my_move, &(10 * XLM));

    assert_eq!(round.outcome, Outcome::Tie);
    assert_eq!(xlm.balance(&player), 100 * XLM);
    assert_eq!(xlm.balance(&bank), 100 * XLM);
}

#[test]
fn bank_too_poor() {
    let (_env, client, xlm, _bank, player) = setup(5 * XLM);
    // La banque n'a que 5 XLM : elle ne peut pas couvrir une mise de 10.
    let result = client.try_play(&player, &Move::Rock, &(10 * XLM));
    assert_eq!(result, Err(Ok(Error::BankTooPoor)));
    assert_eq!(xlm.balance(&player), 100 * XLM); // rien n'a bougé
}

#[test]
fn bet_must_be_positive() {
    let (_env, client, _xlm, _bank, player) = setup(100 * XLM);
    assert_eq!(client.try_play(&player, &Move::Rock, &0), Err(Ok(Error::InvalidBet)));
}
