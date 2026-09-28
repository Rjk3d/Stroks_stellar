// =============================================================================
// errors.rs — Les erreurs "métier" du contrat.
//
// `#[contracterror]` transforme cet enum en erreur Soroban : quand une fonction
// renvoie `Err(Error::BetTooLow)`, la transaction échoue, TOUT est annulé
// (y compris les transferts déjà faits dans cet appel), et le client reçoit
// `Error(Contract, #3)`. Les bindings TypeScript exposent ces codes au front.
//
// IMPORTANT : ne jamais renuméroter un code existant après déploiement, le
// front s'appuie dessus. On ajoute toujours à la fin.
// =============================================================================

use soroban_sdk::contracterror;

#[contracterror]
// PartialOrd/Ord : exigés par la macro pour pouvoir ordonner les codes.
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Le joueur a déjà une partie en cours : il doit jouer ou encaisser avant d'en lancer une autre.
    GameAlreadyInProgress = 1,
    /// `play` ou `cash_out` sans partie en cours.
    NoGameInProgress = 2,
    /// Mise < config.min_bet.
    BetTooLow = 3,
    /// Mise > config.max_bet.
    BetTooHigh = 4,
    /// La banque ne pourrait pas payer le pot doublé si le joueur gagnait.
    BankInsufficient = 5,
    /// Le prochain gain dépasserait config.max_multiplier : il faut encaisser.
    MaxMultiplierReached = 6,
    /// Encaissement impossible tant qu'aucun tour n'a été gagné.
    NothingToCashOut = 7,
    /// Configuration incohérente (min <= 0, min > max, multiplicateur max < 2).
    InvalidConfig = 8,
    /// L'admin veut retirer plus que les fonds libres (solde - pots réservés).
    InsufficientBankForWithdraw = 9,
    /// Montant négatif ou nul.
    InvalidAmount = 10,
}
