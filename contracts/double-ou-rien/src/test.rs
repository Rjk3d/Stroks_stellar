// =============================================================================
// test.rs — Tests unitaires (lancés par `cargo test`).
//
// Ces tests ne touchent PAS le vrai réseau : `Env::default()` crée une
// blockchain simulée en mémoire (feature "testutils" du SDK). Ils s'exécutent
// en une fraction de seconde et gratuitement.
// =============================================================================

// Les tests tournent sur l'ordinateur (pas en WASM) : on peut réactiver la
// bibliothèque standard pour eux (Vec standard, affichage...).
extern crate std;

// `super::*` = tout ce qui est défini dans le module parent (lib.rs) :
// DoubleOuRien, DoubleOuRienClient (généré par #[contractimpl]), Config, Move...
use super::*;
use crate::events::{CashedOut, GameLost, RoundPlayed};
// `as _` : on importe les TRAITS (pour avoir accès à leurs méthodes, comme
// Address::generate ou env.events()) sans importer leur nom.
use soroban_sdk::testutils::{Address as _, Events as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{token, Event, IntoVal};
use std::cell::Cell;

/// 1 XLM = 10 millions de stroops.
const XLM: i128 = 10_000_000;

/// Tout ce dont un test a besoin, regroupé dans une struct.
/// `'static` : les clients générés possèdent une copie de l'Env (pas un
/// emprunt), ils peuvent donc vivre aussi longtemps qu'on veut.
struct Setup {
    env: Env,
    contract_id: Address,
    client: DoubleOuRienClient<'static>,
    token: token::Client<'static>,
    admin: Address,
    player: Address,
    /// Compteur servant à générer une graine de hasard différente à chaque tour.
    /// `Cell` permet de le modifier même à travers une référence non mutable `&Setup`.
    seed_counter: Cell<u8>,
}

/// Crée un réseau simulé, un faux XLM, déploie le contrat et donne de
/// l'argent à la banque (`bank_funds`) et au joueur (100 XLM).
fn setup(bank_funds: i128, max_multiplier: u32) -> Setup {
    let env = Env::default();
    // Toutes les signatures (require_auth) sont considérées comme valides :
    // on teste la logique du jeu, pas la cryptographie.
    env.mock_all_auths();

    // Adresses aléatoires pour l'admin et le joueur.
    let admin = Address::generate(&env);
    let player = Address::generate(&env);

    // Un "Stellar Asset Contract" de test : il se comporte comme le contrat
    // XLM natif du testnet (transfer, balance...) et on peut en créer (mint).
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = token::Client::new(&env, &sac.address());
    let token_admin = token::StellarAssetClient::new(&env, &sac.address());

    let config = Config { min_bet: XLM, max_bet: 10 * XLM, max_multiplier };
    // `env.register(Contrat, (args du constructeur,))` : déploie le contrat et
    // appelle __constructor avec ces arguments (un tuple).
    let contract_id = env.register(DoubleOuRien, (&admin, &sac.address(), &config));
    let client = DoubleOuRienClient::new(&env, &contract_id);

    token_admin.mint(&contract_id, &bank_funds);
    token_admin.mint(&player, &(100 * XLM));

    Setup { env, contract_id, client, token, admin, player, seed_counter: Cell::new(0) }
}

/// Setup "standard" : banque de 1000 XLM, multiplicateur max x8.
fn default_setup() -> Setup {
    setup(1_000 * XLM, 8)
}

// -----------------------------------------------------------------------------
// Contrôle du hasard.
//
// Le réseau fournit un PRNG "de base". À chaque appel de contrat, au premier
// usage de env.prng(), un sous-générateur est dérivé de ce PRNG de base.
// En test, `env.host().set_base_prng_seed(graine)` fixe ce PRNG de base.
//
// Technique "regarder puis rejouer" :
//   1. on fixe la graine ;
//   2. on exécute un tirage "à blanc" dans le contexte du contrat
//      (as_contract) pour VOIR quel coup la banque jouera ;
//   3. on remet la même graine : le prochain vrai appel tirera le même coup.
// On choisit ensuite le coup du joueur pour obtenir le résultat voulu.
//
// Piège rencontré (voir docs/07-debug.md) : le PRNG de base sert AUSSI à
// générer les "nonces" des autorisations simulées. Réutiliser deux fois la
// même graine produit deux fois le même nonce → Error(Auth, ExistingValue).
// On utilise donc une graine différente à chaque tirage.
// -----------------------------------------------------------------------------

fn peek_next_bank_move(s: &Setup) -> Move {
    let n = s.seed_counter.get() + 1;
    s.seed_counter.set(n);
    // `[n; 32]` : un tableau de 32 octets valant tous n.
    let seed = [n; 32];
    s.env.host().set_base_prng_seed(seed).unwrap();
    // `|| { ... }` est une closure (fonction anonyme) exécutée "comme si"
    // on était le contrat.
    let bank_move = s.env.as_contract(&s.contract_id, || {
        let random: u64 = s.env.prng().gen_range(0..=2);
        Move::from_index(random)
    });
    s.env.host().set_base_prng_seed(seed).unwrap();
    bank_move
}

/// Renvoie le coup que le joueur doit jouer pour obtenir `wanted`.
fn move_for(s: &Setup, wanted: Outcome) -> Move {
    let bank = peek_next_bank_move(s);
    let all = [Move::Rock, Move::Paper, Move::Scissors];
    match wanted {
        Outcome::Tie => bank,
        // `.iter().find(...)` cherche le premier élément qui vérifie la condition.
        // `*m` : on "déréférence" la référence pour obtenir la valeur.
        Outcome::Win => *all.iter().find(|m| m.beats(bank)).unwrap(),
        Outcome::Loss => *all.iter().find(|m| bank.beats(**m)).unwrap(),
    }
}

// =============================================================================
// Tests du jeu
// =============================================================================

#[test]
fn test_win_first_round() {
    let s = default_setup();
    let mv = move_for(&s, Outcome::Win);

    let outcome = s.client.start(&s.player, &mv, &(2 * XLM));

    assert_eq!(outcome, Outcome::Win);
    let game = s.client.get_game(&s.player).unwrap();
    assert_eq!(game, Game { bet: 2 * XLM, pot: 4 * XLM, wins: 1, rounds: 1 });
    // La mise a quitté le portefeuille du joueur.
    assert_eq!(s.token.balance(&s.player), 98 * XLM);
    // La banque doit maintenant 4 XLM au joueur.
    assert_eq!(s.client.get_bank().reserved, 4 * XLM);
}

#[test]
fn test_loss_goes_to_bank() {
    let s = default_setup();
    let mv = move_for(&s, Outcome::Loss);

    let outcome = s.client.start(&s.player, &mv, &(2 * XLM));
    // `events().all()` ne contient que les événements du DERNIER appel :
    // on les capture tout de suite, avant les appels de lecture qui suivent.
    let events = s.env.events().all().filter_by_contract(&s.contract_id);

    assert_eq!(outcome, Outcome::Loss);
    // La partie est terminée et supprimée.
    assert_eq!(s.client.get_game(&s.player), None);
    assert_eq!(s.token.balance(&s.player), 98 * XLM);
    let bank = s.client.get_bank();
    assert_eq!(bank.balance, 1_002 * XLM);
    assert_eq!(bank.reserved, 0);
    let stats = s.client.get_stats(&s.player);
    assert_eq!((stats.played, stats.won, stats.lost), (1, 0, 1));

    // Les deux événements du contrat : le tour joué puis la défaite.
    let bank_move = move_beating(mv);
    assert_eq!(
        events,
        [
            RoundPlayed {
                player: s.player.clone(),
                player_move: mv,
                bank_move,
                outcome: Outcome::Loss,
                pot: 0,
                wins: 0,
                rounds: 1,
            }
            .to_xdr(&s.env, &s.contract_id),
            GameLost { player: s.player.clone(), bet: 2 * XLM, lost_pot: 2 * XLM, wins: 0 }
                .to_xdr(&s.env, &s.contract_id),
        ]
    );
}

/// Le coup de la banque qui bat `player_move`.
fn move_beating(player_move: Move) -> Move {
    [Move::Rock, Move::Paper, Move::Scissors]
        .into_iter()
        .find(|b| b.beats(player_move))
        .unwrap()
}

#[test]
fn test_tie_keeps_game_alive() {
    let s = default_setup();
    let mv = move_for(&s, Outcome::Tie);

    assert_eq!(s.client.start(&s.player, &mv, &(2 * XLM)), Outcome::Tie);
    // Rien n'est perdu ni gagné : le pot vaut toujours la mise.
    let game = s.client.get_game(&s.player).unwrap();
    assert_eq!(game, Game { bet: 2 * XLM, pot: 2 * XLM, wins: 0, rounds: 1 });
    // On ne peut pas encaisser sans avoir gagné.
    // Les fonctions `try_xxx` renvoient l'erreur au lieu de faire paniquer le test.
    // Err(Ok(e)) = "erreur du contrat, correctement décodée en Error".
    assert_eq!(s.client.try_cash_out(&s.player), Err(Ok(Error::NothingToCashOut)));

    // On rejoue le tour avec `play` et on gagne.
    let mv = move_for(&s, Outcome::Win);
    assert_eq!(s.client.play(&s.player, &mv), Outcome::Win);
    let game = s.client.get_game(&s.player).unwrap();
    assert_eq!(game, Game { bet: 2 * XLM, pot: 4 * XLM, wins: 1, rounds: 2 });
}

#[test]
fn test_successive_doubling() {
    let s = default_setup();
    s.client.start(&s.player, &move_for(&s, Outcome::Win), &(2 * XLM));
    s.client.play(&s.player, &move_for(&s, Outcome::Win));
    s.client.play(&s.player, &move_for(&s, Outcome::Win));

    // 2 → 4 → 8 → 16 XLM : multiplicateur x8.
    let game = s.client.get_game(&s.player).unwrap();
    assert_eq!(game.pot, 16 * XLM);
    assert_eq!(game.wins, 3);
    assert_eq!(s.client.get_bank().reserved, 16 * XLM);
}

#[test]
fn test_loss_after_doubling_loses_whole_pot() {
    let s = default_setup();
    s.client.start(&s.player, &move_for(&s, Outcome::Win), &(2 * XLM));
    s.client.play(&s.player, &move_for(&s, Outcome::Win));
    // Pot = 8 XLM. On perd : tout va à la banque.
    assert_eq!(s.client.play(&s.player, &move_for(&s, Outcome::Loss)), Outcome::Loss);

    assert_eq!(s.client.get_game(&s.player), None);
    assert_eq!(s.token.balance(&s.player), 98 * XLM);
    assert_eq!(s.client.get_bank().balance, 1_002 * XLM);
    assert_eq!(s.client.get_bank().reserved, 0);
}

#[test]
fn test_cash_out() {
    let s = default_setup();
    s.client.start(&s.player, &move_for(&s, Outcome::Win), &(2 * XLM));
    s.client.play(&s.player, &move_for(&s, Outcome::Win));

    let paid = s.client.cash_out(&s.player);
    let events = s.env.events().all().filter_by_contract(&s.contract_id);

    assert_eq!(paid, 8 * XLM);
    // 100 - 2 (mise) + 8 (gain) = 106 XLM.
    assert_eq!(s.token.balance(&s.player), 106 * XLM);
    assert_eq!(s.client.get_game(&s.player), None);
    assert_eq!(s.client.get_bank().reserved, 0);
    let stats = s.client.get_stats(&s.player);
    assert_eq!(stats, Stats { played: 1, won: 1, lost: 0, biggest_win: 8 * XLM });

    // Seul événement de notre contrat pendant cash_out.
    assert_eq!(
        events,
        [CashedOut { player: s.player.clone(), bet: 2 * XLM, amount: 8 * XLM, multiplier: 4 }
            .to_xdr(&s.env, &s.contract_id)]
    );

    // Une nouvelle partie est de nouveau possible.
    s.client.start(&s.player, &move_for(&s, Outcome::Tie), &(2 * XLM));
    assert_eq!(s.client.get_stats(&s.player).played, 2);
}

#[test]
fn test_max_multiplier_reached() {
    // Multiplicateur max x8 → 3 victoires au maximum.
    let s = default_setup();
    s.client.start(&s.player, &move_for(&s, Outcome::Win), &XLM);
    s.client.play(&s.player, &move_for(&s, Outcome::Win));
    s.client.play(&s.player, &move_for(&s, Outcome::Win));

    let result = s.client.try_play(&s.player, &move_for(&s, Outcome::Win));
    assert_eq!(result, Err(Ok(Error::MaxMultiplierReached)));
    // Le joueur peut toujours encaisser ses x8.
    assert_eq!(s.client.cash_out(&s.player), 8 * XLM);
}

#[test]
fn test_bank_insufficient() {
    // Banque de 1 XLM seulement : elle ne peut pas couvrir un pot de 4 XLM.
    let s = setup(XLM, 8);

    let result = s.client.try_start(&s.player, &Move::Rock, &(2 * XLM));

    assert_eq!(result, Err(Ok(Error::BankInsufficient)));
    // L'erreur a annulé TOUTE la transaction : la mise n'a pas été prélevée.
    assert_eq!(s.token.balance(&s.player), 100 * XLM);
    assert_eq!(s.client.get_game(&s.player), None);
}

#[test]
fn test_bank_insufficient_during_doubling() {
    // Banque de 5 XLM. Mise 2 : pot possible 4 → OK (5 + 2 >= 4).
    // Après la victoire : pot 4, pot possible 8 → 7 XLM en caisse < 8 → refusé.
    let s = setup(5 * XLM, 32);
    s.client.start(&s.player, &move_for(&s, Outcome::Win), &(2 * XLM));

    let result = s.client.try_play(&s.player, &move_for(&s, Outcome::Win));
    assert_eq!(result, Err(Ok(Error::BankInsufficient)));
    assert_eq!(s.client.cash_out(&s.player), 4 * XLM);
}

#[test]
fn test_bet_out_of_bounds() {
    let s = default_setup();
    assert_eq!(s.client.try_start(&s.player, &Move::Rock, &(XLM / 2)), Err(Ok(Error::BetTooLow)));
    assert_eq!(s.client.try_start(&s.player, &Move::Rock, &(11 * XLM)), Err(Ok(Error::BetTooHigh)));
}

#[test]
fn test_game_already_in_progress() {
    let s = default_setup();
    s.client.start(&s.player, &move_for(&s, Outcome::Win), &(2 * XLM));

    let result = s.client.try_start(&s.player, &Move::Rock, &(2 * XLM));
    assert_eq!(result, Err(Ok(Error::GameAlreadyInProgress)));
}

#[test]
fn test_play_and_cash_out_without_game() {
    let s = default_setup();
    assert_eq!(s.client.try_play(&s.player, &Move::Rock), Err(Ok(Error::NoGameInProgress)));
    assert_eq!(s.client.try_cash_out(&s.player), Err(Ok(Error::NoGameInProgress)));
}

#[test]
fn test_new_game_after_loss() {
    // Une partie perdue reste stockée avec pot = 0 (règle d'or de play_round),
    // mais elle ne doit PAS bloquer une nouvelle partie.
    let s = default_setup();
    s.client.start(&s.player, &move_for(&s, Outcome::Loss), &(2 * XLM));
    assert_eq!(s.client.get_game(&s.player), None);

    assert_eq!(s.client.start(&s.player, &move_for(&s, Outcome::Win), &(3 * XLM)), Outcome::Win);
    let game = s.client.get_game(&s.player).unwrap();
    assert_eq!(game, Game { bet: 3 * XLM, pot: 6 * XLM, wins: 1, rounds: 1 });
    // La partie est bien jouable (quelle que soit l'issue du tour).
    assert!(s.client.try_play(&s.player, &Move::Rock).is_ok());
}

// =============================================================================
// Tests d'administration
// =============================================================================

#[test]
fn test_admin_withdraw() {
    let s = default_setup();
    s.client.withdraw(&(100 * XLM));
    assert_eq!(s.token.balance(&s.admin), 100 * XLM);
    assert_eq!(s.client.get_bank().balance, 900 * XLM);
    assert_eq!(s.client.try_withdraw(&0), Err(Ok(Error::InvalidAmount)));
}

#[test]
fn test_withdraw_cannot_take_reserved_funds() {
    let s = setup(10 * XLM, 8);
    // Le joueur gagne : la banque doit 4 XLM. Caisse = 12, disponible = 8.
    s.client.start(&s.player, &move_for(&s, Outcome::Win), &(2 * XLM));
    assert_eq!(s.client.get_bank().available, 8 * XLM);
    assert_eq!(s.client.try_withdraw(&(9 * XLM)), Err(Ok(Error::InsufficientBankForWithdraw)));
    s.client.withdraw(&(8 * XLM));
}

#[test]
fn test_non_admin_cannot_withdraw() {
    let s = default_setup();
    let amount = 100 * XLM;
    // On remplace "toutes les signatures sont valides" par : SEUL le joueur
    // a signé un appel à withdraw. L'admin n'a rien signé.
    s.env.mock_auths(&[MockAuth {
        address: &s.player,
        invoke: &MockAuthInvoke {
            contract: &s.contract_id,
            fn_name: "withdraw",
            args: (amount,).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);

    let result = s.client.try_withdraw(&amount);

    // Échec : ce n'est pas une erreur de NOTRE enum (Err(Ok(...))), mais une
    // erreur d'autorisation levée par le réseau (Err(Err(...))).
    assert!(matches!(result, Err(Err(_))));
    assert_eq!(s.client.get_bank().balance, 1_000 * XLM);
}

#[test]
fn test_set_config() {
    let s = default_setup();
    let bad = Config { min_bet: 5 * XLM, max_bet: XLM, max_multiplier: 8 };
    assert_eq!(s.client.try_set_config(&bad), Err(Ok(Error::InvalidConfig)));

    let good = Config { min_bet: XLM, max_bet: 50 * XLM, max_multiplier: 64 };
    s.client.set_config(&good);
    assert_eq!(s.client.get_config(), good);
}

/// Un déploiement avec une config invalide doit échouer.
#[test]
#[should_panic]
fn test_constructor_rejects_invalid_config() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    let bad = Config { min_bet: 0, max_bet: XLM, max_multiplier: 8 };
    env.register(DoubleOuRien, (&admin, &token, &bad));
}
