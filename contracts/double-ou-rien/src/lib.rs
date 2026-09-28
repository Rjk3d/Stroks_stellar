// =============================================================================
// lib.rs — Le contrat "Double ou Rien".
//
// Pierre-feuille-ciseaux contre la banque (le contrat lui-même) :
//   start    → le joueur mise et joue le 1er tour
//   play     → il remet tout son pot en jeu (x2 à chaque victoire)
//   cash_out → il encaisse son pot
// Égalité : on rejoue. Défaite : le pot va à la banque.
// =============================================================================

// Un contrat Soroban tourne dans une machine virtuelle WASM minimaliste : pas
// de système de fichiers, pas de réseau, pas d'allocateur standard. `no_std`
// dit à Rust de ne PAS inclure la bibliothèque standard ; le SDK fournit ce
// dont on a besoin (Vec, Map, Address...) via l'environnement `Env`.
#![no_std]

// `mod x;` déclare un module = le fichier x.rs.
mod errors;
mod events;
mod types;

// Le module de tests n'est compilé QUE pendant `cargo test` (#[cfg(test)]) :
// il n'alourdit pas le WASM déployé.
#[cfg(test)]
mod test;

// `pub use` ré-exporte ces types pour qu'ils soient visibles de l'extérieur
// (tests, et surtout l'interface du contrat → bindings TypeScript).
pub use errors::Error;
pub use types::{BankInfo, Config, Game, Move, Outcome, Stats};

use events::{CashedOut, GameLost, RoundPlayed};
use soroban_sdk::{contract, contractimpl, panic_with_error, token, Address, Env};
use types::DataKey;

// -----------------------------------------------------------------------------
// Constantes de durée de vie (TTL) du stockage.
//
// Sur Stellar, chaque donnée stockée a une durée de vie en LEDGERS (un ledger
// = un "bloc", environ toutes les 5 secondes). Quand le TTL tombe à zéro, la
// donnée est ARCHIVÉE : elle n'est plus lisible tant que quelqu'un ne la
// restaure pas (opération payante). C'est le "state archival" : on paie un
// loyer pour occuper de la place dans l'état du réseau.
//
// Stratégie classique : à chaque utilisation, si le TTL restant est sous un
// SEUIL (threshold), on le repousse à une valeur CIBLE (extend_to).
// -----------------------------------------------------------------------------

/// Nombre de ledgers dans une journée : 24 h * 3600 s / 5 s.
const DAY_IN_LEDGERS: u32 = 17_280;
/// On repousse le TTL à ~30 jours...
const TTL_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;
/// ... dès qu'il descend sous ~29 jours (donc au plus une extension par jour
/// et par donnée, pour ne pas payer ce loyer à chaque appel).
const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - DAY_IN_LEDGERS;

// `#[contract]` marque la structure qui représente notre contrat. Elle est
// vide : un contrat Soroban n'a pas de champs en mémoire, tout son état est
// dans le stockage de la blockchain.
#[contract]
pub struct DoubleOuRien;

// `#[contractimpl]` : chaque fonction `pub` de ce bloc devient une fonction
// APPELABLE depuis l'extérieur (CLI, front, autres contrats).
#[contractimpl]
impl DoubleOuRien {
    // =========================================================================
    // Constructeur
    // =========================================================================

    /// Appelé UNE SEULE FOIS, automatiquement, au moment du déploiement
    /// (`stellar contract deploy ... -- --admin ... --token ... --config ...`).
    /// Impossible de le rappeler ensuite : personne ne peut "réinitialiser"
    /// le contrat pour en prendre le contrôle.
    ///
    /// `env: Env` : l'environnement d'exécution, notre porte d'accès à TOUT
    /// (stockage, événements, hasard, adresse du contrat...). Il est passé
    /// en premier paramètre de chaque fonction du contrat.
    pub fn __constructor(env: Env, admin: Address, token: Address, config: Config) {
        // `if let Err(e) = ...` : on ne s'intéresse qu'au cas d'erreur.
        // panic_with_error! fait échouer le déploiement avec notre code d'erreur.
        if let Err(e) = validate_config(&config) {
            panic_with_error!(&env, e);
        }
        // Stockage INSTANCE : lié au contrat lui-même, idéal pour une petite
        // configuration globale lue à chaque appel. Elle partage un seul TTL
        // avec le code du contrat.
        let storage = env.storage().instance();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::Token, &token);
        storage.set(&DataKey::Config, &config);
        // `0i128` : le suffixe précise le type du littéral (0 de type i128).
        storage.set(&DataKey::Reserved, &0i128);
        extend_instance(&env);
    }

    // =========================================================================
    // Fonctions de jeu
    // =========================================================================

    /// Lance une partie : mise `bet` stroops et joue le premier tour.
    ///
    /// `Result<Outcome, Error>` : soit `Ok(résultat)`, soit `Err(code)`.
    /// Rust n'a pas d'exceptions : les erreurs sont des VALEURS de retour.
    pub fn start(env: Env, player: Address, player_move: Move, bet: i128) -> Result<Outcome, Error> {
        // Vérifie que `player` a bien SIGNÉ cette transaction (ou autorisé
        // cet appel). Sans cette ligne, n'importe qui pourrait miser l'argent
        // d'un autre ! Si l'autorisation manque, tout échoue ici.
        player.require_auth();
        extend_instance(&env);

        let config = read_config(&env);
        if bet < config.min_bet {
            return Err(Error::BetTooLow);
        }
        if bet > config.max_bet {
            return Err(Error::BetTooHigh);
        }
        // `.is_some()` : vrai si l'Option contient une valeur (une partie existe).
        if read_game(&env, &player).is_some() {
            return Err(Error::GameAlreadyInProgress);
        }

        // Le joueur envoie sa mise au contrat. `token_client` parle au contrat
        // du token XLM (le "Stellar Asset Contract"). Le `&` passe une
        // RÉFÉRENCE (on prête la valeur sans en céder la propriété).
        // Si le joueur n'a pas assez d'XLM, le transfert échoue et tout est annulé.
        token_client(&env).transfer(&player, &env.current_contract_address(), &bet);

        // La mise est désormais "due" au joueur tant que la partie dure.
        write_reserved(&env, read_reserved(&env) + bet);

        let mut stats = read_stats(&env, &player);
        stats.played += 1;
        write_stats(&env, &player, &stats);

        // `mut` : la variable pourra être modifiée (tout est immuable par défaut en Rust).
        let mut game = Game { bet, pot: bet, wins: 0, rounds: 0 };
        // `&mut game` : on prête la partie EN ÉCRITURE à play_round.
        // Pas de `;` final : la valeur de cette expression (le Result renvoyé
        // par play_round) EST la valeur de retour de start.
        // Si c'est un Err, toute la transaction est annulée, transfert compris.
        play_round(&env, &player, &mut game, player_move)
    }

    /// Remet tout le pot en jeu pour un nouveau tour.
    pub fn play(env: Env, player: Address, player_move: Move) -> Result<Outcome, Error> {
        player.require_auth();
        extend_instance(&env);

        let config = read_config(&env);
        // `.ok_or(e)` transforme une Option en Result : None devient Err(e).
        // Puis `?` sort de la fonction en cas d'erreur. En une ligne :
        // "la partie, ou l'erreur NoGameInProgress".
        let mut game = read_game(&env, &player).ok_or(Error::NoGameInProgress)?;

        // Une victoire de plus donnerait un multiplicateur 2^(wins+1).
        // `checked_pow` renvoie None en cas de dépassement d'entier, au lieu
        // de planter : on le traite comme "trop grand".
        let next_multiplier = 2u32.checked_pow(game.wins + 1);
        match next_multiplier {
            Some(m) if m <= config.max_multiplier => {}
            _ => return Err(Error::MaxMultiplierReached),
        }

        play_round(&env, &player, &mut game, player_move)
    }

    /// Encaisse le pot et termine la partie. Renvoie le montant versé.
    pub fn cash_out(env: Env, player: Address) -> Result<i128, Error> {
        player.require_auth();
        extend_instance(&env);

        let game = read_game(&env, &player).ok_or(Error::NoGameInProgress)?;
        if game.wins == 0 {
            // Juste après une égalité au 1er tour : rien n'a encore été gagné.
            return Err(Error::NothingToCashOut);
        }

        // Le contrat paie le joueur. Pas besoin de require_auth pour le
        // contrat : un contrat autorise automatiquement les transferts
        // venant de sa propre adresse.
        token_client(&env).transfer(&env.current_contract_address(), &player, &game.pot);

        write_reserved(&env, read_reserved(&env) - game.pot);
        remove_game(&env, &player);

        let mut stats = read_stats(&env, &player);
        stats.won += 1;
        // `.max()` garde le plus grand des deux.
        stats.biggest_win = stats.biggest_win.max(game.pot);
        write_stats(&env, &player, &stats);

        CashedOut {
            player,
            bet: game.bet,
            amount: game.pot,
            multiplier: nominal_multiplier(game.wins),
        }
        .publish(&env);

        Ok(game.pot)
    }

    // =========================================================================
    // Lectures (gratuites : le front les appelle en simple simulation)
    // =========================================================================

    /// La partie en cours du joueur, ou `None` (→ `undefined` côté TypeScript).
    pub fn get_game(env: Env, player: Address) -> Option<Game> {
        read_game(&env, &player)
    }

    /// Les statistiques du joueur (tout à zéro s'il n'a jamais joué).
    pub fn get_stats(env: Env, player: Address) -> Stats {
        read_stats(&env, &player)
    }

    /// La configuration actuelle (limites de mise, multiplicateur max, taux).
    pub fn get_config(env: Env) -> Config {
        read_config(&env)
    }

    /// L'état de la banque : solde, montant réservé, montant disponible.
    pub fn get_bank(env: Env) -> BankInfo {
        let balance = bank_balance(&env);
        let reserved = read_reserved(&env);
        BankInfo { balance, reserved, available: balance - reserved }
    }

    // =========================================================================
    // Administration
    // =========================================================================

    /// L'admin retire des XLM de la banque, sans toucher à l'argent promis aux joueurs.
    pub fn withdraw(env: Env, amount: i128) -> Result<(), Error> {
        let admin = read_admin(&env);
        // Seul l'admin (qui doit signer) peut retirer. Si quelqu'un d'autre
        // appelle cette fonction, require_auth échoue : ce n'est pas une
        // erreur de NOTRE enum, c'est une erreur d'autorisation du réseau.
        admin.require_auth();
        extend_instance(&env);

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let available = bank_balance(&env) - read_reserved(&env);
        if amount > available {
            return Err(Error::InsufficientBankForWithdraw);
        }
        token_client(&env).transfer(&env.current_contract_address(), &admin, &amount);
        // `Ok(())` : succès sans valeur. `()` est le type "unité" (rien).
        Ok(())
    }

    /// L'admin remplace la configuration.
    pub fn set_config(env: Env, config: Config) -> Result<(), Error> {
        read_admin(&env).require_auth();
        extend_instance(&env);
        validate_config(&config)?;
        env.storage().instance().set(&DataKey::Config, &config);
        Ok(())
    }
}

// =============================================================================
// Fonctions internes (pas de `pub` dans #[contractimpl] → NON appelables de
// l'extérieur). Elles factorisent la logique et les accès au stockage.
// =============================================================================

/// Joue UN tour : tire le coup de la banque, compare, met à jour l'état.
fn play_round(
    env: &Env,
    player: &Address,
    game: &mut Game,
    player_move: Move,
) -> Result<Outcome, Error> {
    // --- 1. La banque peut-elle payer si le joueur gagne ? ---
    let reserved = read_reserved(env);
    let pot_if_win = doubled_pot(game.pot);
    // Après une victoire, la banque devrait (reserved - pot + pot_if_win) au
    // total, en comptant les autres parties en cours. Son solde doit couvrir
    // cette dette dans le pire cas.
    if bank_balance(env) < reserved - game.pot + pot_if_win {
        return Err(Error::BankInsufficient);
    }

    // --- 2. Le hasard ---
    // env.prng() : générateur pseudo-aléatoire fourni par le réseau.
    // ATTENTION : il est prévisible/manipulable (voir docs/06-securite.md).
    // `: u64` annote le type voulu ; gen_range(0..=2) tire 0, 1 ou 2.
    let random: u64 = env.prng().gen_range(0..=2);
    let bank_move = Move::from_index(random);

    let outcome = if player_move == bank_move {
        Outcome::Tie
    } else if player_move.beats(bank_move) {
        Outcome::Win
    } else {
        Outcome::Loss
    };

    // --- 3. Mise à jour de l'état ---
    //
    // ⚠️ RÈGLE D'OR pour un contrat à hasard : quelle que soit l'issue, on
    // fait EXACTEMENT les mêmes écritures (Reserved, Stats, Game), de même
    // taille. Pourquoi ? Le client SIMULE la transaction avant de l'envoyer :
    // la simulation mesure les données touchées (le "footprint") et le coût
    // (dont le "loyer" des données écrites). Mais le hasard de la simulation
    // n'est PAS celui du vrai ledger ! Si la simulation tirait une défaite
    // (partie effacée, rien à payer) et le vrai tour une victoire (partie
    // écrite pour 30 jours), la transaction échouerait on-chain faute de
    // frais suffisants. Voir docs/07-debug.md.
    //
    // C'est pourquoi une partie perdue n'est pas effacée : elle est écrite
    // avec `pot = 0`, qui signifie "terminée" (voir read_game).
    let mut stats = read_stats(env, player);
    // `game` est une référence mutable : on modifie la partie de l'appelant.
    game.rounds += 1;
    // Pot avant le tour : utile pour l'événement de défaite.
    let pot_before = game.pot;
    // `match` renvoie une valeur : la nouvelle dette de la banque.
    let new_reserved = match outcome {
        Outcome::Win => {
            // La dette de la banque passe de l'ancien pot au pot doublé.
            game.pot = pot_if_win;
            game.wins += 1;
            reserved - pot_before + pot_if_win
        }
        // Égalité : rien ne change sauf le compteur de tours (déjà fait).
        Outcome::Tie => reserved,
        Outcome::Loss => {
            // La banque ne doit plus rien : le pot lui revient.
            game.pot = 0;
            stats.lost += 1;
            reserved - pot_before
        }
    };
    write_game(env, player, game);
    write_reserved(env, new_reserved);
    write_stats(env, player, &stats);

    RoundPlayed {
        // `.clone()` : on crée une copie de l'adresse, car la struct
        // d'événement doit POSSÉDER sa valeur alors qu'on n'a qu'une référence.
        player: player.clone(),
        player_move,
        bank_move,
        outcome,
        pot: game.pot,
        wins: game.wins,
        rounds: game.rounds,
    }
    .publish(env);

    if outcome == Outcome::Loss {
        GameLost { player: player.clone(), bet: game.bet, lost_pot: pot_before, wins: game.wins }
            .publish(env);
    }

    Ok(outcome)
}

/// Pot après une victoire : exactement le double (jeu équitable, pas
/// d'avantage maison).
fn doubled_pot(pot: i128) -> i128 {
    pot * 2
}

/// 2^wins, avec un décalage de bits : 1 << 3 = 8.
fn nominal_multiplier(wins: u32) -> u32 {
    1u32 << wins
}

/// Règles de cohérence de la config. Renvoie `Result<(), Error>` pour pouvoir
/// être utilisée avec `?` dans set_config.
fn validate_config(config: &Config) -> Result<(), Error> {
    let valid = config.min_bet > 0 && config.min_bet <= config.max_bet && config.max_multiplier >= 2;
    if valid {
        Ok(())
    } else {
        Err(Error::InvalidConfig)
    }
}

// ---------------------------- Stockage instance ------------------------------

/// Prolonge la vie de l'instance (config + code du contrat).
fn extend_instance(env: &Env) {
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// `.get()` renvoie une Option (la clé peut ne pas exister). Ici elle existe
/// toujours car le constructeur l'a écrite : `.unwrap()` extrait la valeur
/// (et ferait échouer la transaction si elle manquait, ce qui ne peut pas arriver).
fn read_config(env: &Env) -> Config {
    env.storage().instance().get(&DataKey::Config).unwrap()
}

fn read_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn read_reserved(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::Reserved).unwrap()
}

fn write_reserved(env: &Env, value: i128) {
    env.storage().instance().set(&DataKey::Reserved, &value);
}

/// Client du contrat de token (XLM natif). `token::Client` est généré par le
/// SDK pour parler à n'importe quel token standard SEP-41.
/// `<'_>` : le client EMPRUNTE `env` ; Rust vérifie qu'il ne lui survit pas.
fn token_client(env: &Env) -> token::Client<'_> {
    let token_id: Address = env.storage().instance().get(&DataKey::Token).unwrap();
    token::Client::new(env, &token_id)
}

/// Solde en XLM du contrat lui-même, c'est-à-dire la caisse de la banque.
fn bank_balance(env: &Env) -> i128 {
    token_client(env).balance(&env.current_contract_address())
}

// --------------------------- Stockage persistent -----------------------------
// Le stockage PERSISTENT a un TTL par entrée. On l'utilise pour les données
// propres à chaque joueur : elles peuvent être nombreuses et doivent survivre
// longtemps. Si une entrée est archivée, elle peut être restaurée (jamais
// perdue), contrairement au stockage "temporary".

/// La partie EN COURS du joueur. Une partie perdue reste stockée avec
/// `pot == 0` (voir la règle d'or dans play_round) : on la filtre.
fn read_game(env: &Env, player: &Address) -> Option<Game> {
    // `.clone()` : la clé DataKey::Game doit posséder son Address.
    env.storage()
        .persistent()
        .get(&DataKey::Game(player.clone()))
        // `.filter(...)` garde Some(g) seulement si la condition est vraie,
        // sinon renvoie None. `|g: &Game|` est une closure qui reçoit la partie.
        .filter(|g: &Game| g.pot > 0)
}

fn write_game(env: &Env, player: &Address, game: &Game) {
    let key = DataKey::Game(player.clone());
    env.storage().persistent().set(&key, game);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn remove_game(env: &Env, player: &Address) {
    env.storage().persistent().remove(&DataKey::Game(player.clone()));
}

fn read_stats(env: &Env, player: &Address) -> Stats {
    // `.unwrap_or_default()` : la valeur stockée, ou Stats::default() (tout à 0).
    env.storage()
        .persistent()
        .get(&DataKey::Stats(player.clone()))
        .unwrap_or_default()
}

fn write_stats(env: &Env, player: &Address, stats: &Stats) {
    let key = DataKey::Stats(player.clone());
    env.storage().persistent().set(&key, stats);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}
