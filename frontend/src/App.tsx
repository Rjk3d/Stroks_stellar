import { useEffect, useReducer, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  ExternalLink,
  FlaskConical,
  Gamepad2,
  LoaderCircle,
  Minus,
  Monitor,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Wallet,
  X,
} from 'lucide-react';
import { Hand, Spark } from './components/Hand';
import { Reel } from './components/Reel';
import { Dialog } from './components/Dialog';
import {
  amountInput,
  formatAmount,
  formatBalance,
  gameReducer,
  INITIAL_GAME,
  messageFor,
  MOVES,
  NAMES,
  parseAmount,
  UNIT,
  type Balance,
  type Mode,
  type Move,
  type Pending,
  type Progress,
  type Round,
  type Scenario,
} from './game';
import * as demo from './adapters/demo';
import { readPending } from './storage';
import { transactionLink } from './transactionLink';

const live = () => import('./adapters/stellar');
const scenarios: [Scenario, string][] = [
  ['sequence', 'Parcours jury : victoire → égalité → victoire → défaite'],
  ['win', 'Victoire'],
  ['tie', 'Égalité'],
  ['loss', 'Défaite'],
  ['refused', 'Signature refusée'],
  ['slow', 'Confirmation lente'],
  ['network', 'Erreur réseau après envoi'],
  ['bank', 'Banque insuffisante'],
];
const beats: Record<Move, string> = {
  rock: 'Bat les ciseaux',
  paper: 'Bat la pierre',
  scissors: 'Battent la feuille',
};
function safePending(): { pending: Pending | null; error: string | null } {
  try {
    return { pending: readPending(), error: null };
  } catch (e) {
    return { pending: null, error: messageFor(e) };
  }
}

export default function App() {
  const [initial] = useState(safePending);
  const [mode, setMode] = useState<Mode>(initial.pending || initial.error ? 'testnet' : 'demo');
  const [screen, setScreen] = useState<'menu' | 'arena'>('menu');
  const [game, dispatch] = useReducer(gameReducer, INITIAL_GAME);
  const [betText, setBetText] = useState('10');
  const [balance, setBalance] = useState<Balance | null>(
    initial.pending || initial.error ? null : { total: demo.balance(), available: demo.balance() },
  );
  const [balanceFresh, setBalanceFresh] = useState(!initial.pending);
  const [address, setAddress] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [pending, setPending] = useState(Boolean(initial.pending) || demo.pending());
  const [storageError] = useState(initial.error);
  const [hash, setHash] = useState(initial.pending?.hash ?? '');
  const [fee, setFee] = useState<bigint | null>(null);
  const [notice, setNotice] = useState<string | null>(
    initial.pending ? 'Transaction retrouvée. Vérifie son état avant de rejouer.' : null,
  );
  const [dialog, setDialog] = useState<'rules' | 'settings' | 'demo' | null>(null);
  const [scenario, setScenario] = useState<Scenario>('sequence');
  const [reduced, setReduced] = useState(
    () =>
      localStorage.getItem('strock:motion') === 'reduce' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [active, setActive] = useState(false);
  const [longWait, setLongWait] = useState(false);
  const [copied, setCopied] = useState(false);
  const lock = useRef(false);
  const cancelled = useRef(false);
  const balanceRequest = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const amountField = useRef<HTMLInputElement>(null);
  const blocked = active || pending || game.phase === 'revealing' || Boolean(storageError);
  let bet = 0n;
  let betError = '';
  try {
    bet = parseAmount(betText);
    if (balance && bet > balance.available) betError = 'Le montant dépasse ton solde disponible.';
  } catch (e) {
    betError = messageFor(e);
  }
  const playable = !blocked && !betError && (mode === 'demo' || Boolean(address && balanceFresh));
  const progress = (p: Progress) => {
    dispatch({ type: 'progress', phase: p.phase });
    if (p.fee !== undefined) setFee(p.fee);
    if (p.hash) setHash(p.hash);
    if (p.phase === 'pending' || p.phase === 'sending') setPending(true);
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {
      if (media.matches) setReduced(true);
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    setLongWait(false);
    if (game.phase !== 'pending') return;
    const timeout = setTimeout(() => setLongWait(true), 4500);
    return () => clearTimeout(timeout);
  }, [game.phase]);
  useEffect(() => {
    if (screen === 'arena' || game.phase === 'result') heading.current?.focus();
  }, [screen, game.phase === 'result']);

  async function refreshBalance(account = address) {
    const request = ++balanceRequest.current;
    if (mode === 'demo') {
      const total = demo.balance();
      setBalance({ total, available: total });
      setBalanceFresh(true);
      return;
    }
    setBalanceFresh(false);
    if (!account) {
      setBalance(null);
      return;
    }
    try {
      const next = await (await live()).readBalance(account);
      if (request === balanceRequest.current) {
        setBalance(next);
        setBalanceFresh(true);
      }
    } catch (e) {
      if (request === balanceRequest.current) setNotice(`Solde à actualiser. ${messageFor(e)}`);
    }
  }
  async function connect() {
    if (connecting || active) return;
    setConnecting(true);
    setNotice(null);
    try {
      const account = await (await live()).connect();
      setAddress(account);
      await refreshBalance(account);
    } catch (e) {
      setNotice(messageFor(e));
    } finally {
      setConnecting(false);
    }
  }
  function switchMode(next: Mode) {
    if (blocked || connecting || next === mode) return;
    balanceRequest.current++;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setMode(next);
    setScreen('menu');
    dispatch({ type: 'reset' });
    setNotice(null);
    setHash('');
    setFee(null);
    if (next === 'demo') {
      const total = demo.balance();
      setBalance({ total, available: total });
      setBalanceFresh(true);
      setPending(demo.pending());
    } else {
      setBalance(null);
      setBalanceFresh(false);
      const p = safePending();
      setPending(Boolean(p.pending));
      setHash(p.pending?.hash ?? '');
    }
  }
  async function reveal(round: Round) {
    setPending(false);
    setHash(round.hash ?? '');
    dispatch({ type: 'confirmed', round });
    if (round.fee !== undefined) setFee(round.fee);
    const recoveryAddress = safePending().pending?.address;
    await refreshBalance(address || recoveryAddress || initial.pending?.address);
    timers.current.push(
      setTimeout(
        () => {
          dispatch({ type: 'reveal' });
          if (round.outcome === 'loss')
            timers.current.push(
              setTimeout(
                () => {
                  setScreen('menu');
                  setNotice(
                    `Manche perdue : ${formatAmount(round.bet)} XLM${mode === 'demo' ? ' fictifs' : ''}. Choisis une nouvelle mise pour rejouer.`,
                  );
                  dispatch({ type: 'reset' });
                },
                reduced ? 800 : 2100,
              ),
            );
          if (round.outcome === 'tie')
            timers.current.push(
              setTimeout(
                () => {
                  setNotice(
                    `Égalité : ${formatAmount(round.bet)} XLM remboursés. Une nouvelle manche nécessite ${mode === 'demo' ? 'une nouvelle mise simulée' : 'une nouvelle signature'}.`,
                  );
                  setBetText(amountInput(round.bet));
                  dispatch({ type: 'reset' });
                },
                reduced ? 800 : 1900,
              ),
            );
        },
        reduced ? 100 : 1300,
      ),
    );
  }
  async function exclusive(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setActive(true);
    try {
      if (!navigator.locks)
        throw new Error(
          'Utilise une version récente de Chrome, Edge ou Firefox pour sécuriser les envois.',
        );
      await navigator.locks.request(
        `strock:${mode}:round`,
        { ifAvailable: true },
        async (lease) => {
          if (!lease)
            throw new Error(
              'Une action est en cours dans un autre onglet. Attends sa fin, puis actualise.',
            );
          await operation();
        },
      );
    } catch (e) {
      const remains = mode === 'demo' ? demo.pending() : Boolean(safePending().pending);
      setPending(remains);
      if (remains) {
        dispatch({ type: 'progress', phase: 'pending' });
        setNotice(
          `${messageFor(e)} La référence est conservée ; aucune nouvelle mise n’est envoyée.`,
        );
      } else {
        dispatch({ type: 'error', error: messageFor(e) });
        setNotice(messageFor(e));
        if (mode === 'testnet') await refreshBalance();
      }
    } finally {
      lock.current = false;
      setActive(false);
    }
  }
  async function choose(move: Move) {
    if (!playable || !['idle', 'error'].includes(game.phase)) return;
    cancelled.current = false;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setNotice(null);
    setHash('');
    setFee(null);
    dispatch({ type: 'start', move });
    await exclusive(async () => {
      const round =
        mode === 'demo'
          ? await demo.play(move, bet, scenario, progress, () => cancelled.current)
          : await (await live()).play(address, move, bet, progress, () => cancelled.current);
      if (round) await reveal(round);
      else {
        setPending(true);
        setNotice(
          'La confirmation prend un peu de temps. Vérifie à nouveau sans engager une autre mise.',
        );
      }
    });
  }
  async function resume() {
    setScreen('arena');
    setNotice(null);
    const stored = mode === 'demo' ? demo.pendingRound() : safePending().pending;
    if (stored) {
      setBetText(amountInput(BigInt(stored.bet)));
      dispatch({ type: 'start', move: stored.move });
    }
    await exclusive(async () => {
      const round =
        mode === 'demo' ? await demo.resume(progress) : await (await live()).resume(progress);
      if (round) await reveal(round);
      else {
        const remains = mode === 'demo' ? demo.pending() : Boolean(safePending().pending);
        setPending(remains);
        if (!remains) {
          dispatch({ type: 'reset' });
          setScreen('menu');
          await refreshBalance();
        }
        setNotice(
          remains
            ? 'Toujours en attente de confirmation. Tu peux vérifier à nouveau dans quelques instants.'
            : 'Cette manche a déjà été traitée dans un autre onglet. Aucune nouvelle mise envoyée.',
        );
      }
    });
  }
  function rematch() {
    if (!game.round || blocked) return;
    setBetText(amountInput(game.round.payout));
    dispatch({ type: 'reset' });
    setNotice(
      'Le montant reçu est proposé pour la prochaine manche. Choisis ton coup pour le rejouer.',
    );
    setFee(null);
  }
  function returnMenu() {
    setScreen('menu');
    if (['preparing', 'signing'].includes(game.phase)) {
      cancelled.current = true;
      setNotice(
        'Préparation abandonnée. Aucune transaction ne sera envoyée. Ferme la demande Freighter si elle est ouverte.',
      );
    }
    if (!blocked && game.phase !== 'revealing') {
      dispatch({ type: 'reset' });
      timers.current.forEach(clearTimeout);
      timers.current = [];
    }
  }
  function start() {
    if (playable) {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setScreen('arena');
      dispatch({ type: 'reset' });
      setNotice(null);
    }
  }
  const result = game.round;
  const showingResult = Boolean(result && game.phase === 'result');
  const isRolling = ['sending', 'pending'].includes(game.phase) && !longWait;
  const phaseText = {
    idle: 'Le prochain coup est le tien.',
    preparing: 'Préparation de la manche…',
    signing: mode === 'demo' ? 'Signature simulée…' : 'Confirme la signature dans Freighter',
    sending: 'Envoi de la transaction…',
    pending: 'Confirmation en attente…',
    revealing: 'Le verdict arrive…',
    result:
      result?.outcome === 'win'
        ? 'Bien joué. À toi la victoire !'
        : result?.outcome === 'tie'
          ? 'Égalité. On remet ça ?'
          : 'Cette fois, le bot l’emporte.',
    error: 'On reprend ?',
  }[game.phase];
  const transactionUrl = transactionLink(hash);

  return (
    <div className={`app ${reduced ? 'reduced-motion' : ''}`}>
      <header className="topbar">
        <button className="brand" onClick={returnMenu} aria-label="strock — menu principal">
          <span className="brand-mark">
            <Hand move="rock" />
            <Hand move="scissors" />
          </span>
          <span>
            strock<span className="brand-dot">.</span>
          </span>
          <Hand move="paper" className="brand-paper" />
        </button>
        <nav className="mode-switch" aria-label="Mode de jeu">
          <button
            className={mode === 'demo' ? 'selected' : ''}
            aria-pressed={mode === 'demo'}
            disabled={blocked || connecting}
            onClick={() => switchMode('demo')}
          >
            <FlaskConical size={15} /> Démo
          </button>
          <button
            className={mode === 'testnet' ? 'selected' : ''}
            aria-pressed={mode === 'testnet'}
            disabled={blocked || connecting}
            onClick={() => switchMode('testnet')}
          >
            <span className="network-dot" /> Stellar Testnet
          </button>
        </nav>
        <div className="header-actions">
          <button className="text-button" onClick={() => setDialog('rules')}>
            <CircleHelp size={17} /> Comment jouer
          </button>
          <span className="header-divider" />
          <button
            className="wallet-button"
            onClick={mode === 'demo' ? () => setDialog('demo') : connect}
            disabled={connecting || active}
          >
            {connecting ? <LoaderCircle size={17} className="spin" /> : <Wallet size={17} />}{' '}
            {mode === 'demo'
              ? 'Portefeuille démo'
              : address
                ? `${address.slice(0, 5)}…${address.slice(-4)}`
                : 'Connecter Freighter'}
            <ChevronDown size={14} />
          </button>
        </div>
      </header>

      <main>
        <div className="context-row">
          {mode === 'demo' && (
            <>
              <span className="context-tag">
                <span className="network-dot" />
                MODE DÉMO · XLM FICTIFS
              </span>
              <span className="context-note">Tout le jeu. Sans portefeuille.</span>
            </>
          )}
        </div>
        {(notice || storageError) && (
          <div
            className={`notice ${game.phase === 'error' || storageError ? 'error-notice' : ''}`}
            role="status"
          >
            <span>{storageError || notice}</span>
            {!storageError && (
              <button
                className="icon-button"
                aria-label="Masquer le message"
                onClick={() => setNotice(null)}
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {screen === 'menu' && transactionUrl && (
          <a className="transaction-link" href={transactionUrl} target="_blank" rel="noreferrer">
            Dernière transaction : {hash.slice(0, 8)}…{hash.slice(-6)} <ExternalLink size={12} />
          </a>
        )}
        {screen === 'arena' && betError && ['idle', 'error'].includes(game.phase) && (
          <div className="notice error-notice" role="alert">
            {betError} Utilise « Modifier la mise » pour continuer.
          </div>
        )}
        {pending && screen === 'menu' && (
          <div className="pending-banner">
            <LoaderCircle className="spin" size={20} />
            <div>
              <strong>Une manche attend sa confirmation</strong>
              <span>Retrouve son état avant de rejouer. Revenir ici ne l’annule pas.</span>
            </div>
            <button className="button primary small" disabled={active} onClick={resume}>
              Vérifier la manche <ArrowRight size={17} />
            </button>
          </div>
        )}

        {screen === 'menu' ? (
          <>
            <section className="hero" aria-labelledby="hero-title">
              <div className="hero-copy">
                <h1 id="hero-title">
                  Un choix.
                  <br />
                  <span>Tout peut changer.</span>
                </h1>
                <p>Pierre, feuille, ciseaux.</p>
                <div className="hero-pills">
                  <span>
                    <Gamepad2 size={16} /> Toi contre le bot
                  </span>
                  <span>
                    <ArrowUpRight size={16} /> Mise ×2 si tu gagnes
                  </span>
                </div>
              </div>
              <div
                className="hero-art"
                aria-label="Pierre bat ciseaux, ciseaux battent feuille, feuille bat pierre"
                role="img"
              >
                <Spark className="spark spark-one" />
                <Spark className="spark spark-two" />
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="art-card art-rock">
                  <span>01 / PIERRE</span>
                  <Hand move="rock" />
                  <span className="card-star">✦</span>
                </div>
                <div className="art-card art-paper">
                  <span>02 / FEUILLE</span>
                  <Hand move="paper" />
                  <span className="card-star">✦</span>
                </div>
                <div className="art-card art-scissors">
                  <span>03 / CISEAUX</span>
                  <Hand move="scissors" />
                  <span className="card-star">✦</span>
                </div>
                <div className="art-sticker">
                  <span>LA CHANCE</span>
                  <strong>a du jeu.</strong>
                  <Sparkles size={18} />
                </div>
                <span className="art-caption">Trois signes. Un seul gagnant.</span>
              </div>
            </section>
            <section className="bet-panel" aria-labelledby="bet-title">
              <div className="bet-intro">
                <div className="step-number">01</div>
                <div>
                  <h2 id="bet-title">La partie commence ici.</h2>
                  <p>Pose ta mise. Fais ton choix.</p>
                </div>
              </div>
              <div className="bet-controls">
                <label htmlFor="bet">TA MISE</label>
                <div className={`amount-input ${betError ? 'invalid' : ''}`}>
                  <input
                    ref={amountField}
                    id="bet"
                    value={betText}
                    onChange={(e) => setBetText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') start();
                    }}
                    disabled={blocked}
                    aria-invalid={Boolean(betError)}
                    aria-describedby="bet-help"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <span>XLM</span>
                </div>
                <div className="quick-bets">
                  {[1, 5, 10, 20].map((value) => (
                    <button
                      key={value}
                      className={bet === BigInt(value) * UNIT ? 'active' : ''}
                      onClick={() => setBetText(String(value))}
                      disabled={blocked}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bet-outlook">
                <span>SI TU GAGNES</span>
                <strong>
                  {bet > 0n && !betError ? formatAmount(bet * 2n) : '—'} <small>XLM</small>
                  <ArrowUpRight size={23} />
                </strong>
              </div>
              <div className="start-block">
                <button
                  className="button primary start-button"
                  onClick={mode === 'testnet' && !address ? connect : start}
                  disabled={
                    blocked ||
                    connecting ||
                    Boolean(betError) ||
                    (mode === 'testnet' && Boolean(address) && !balanceFresh)
                  }
                >
                  {connecting
                    ? 'Connexion…'
                    : mode === 'testnet' && !address
                      ? 'Connecter pour jouer'
                      : 'Choisir mon coup'}
                  <ArrowRight size={20} />
                </button>
                <span>
                  <ShieldCheck size={13} />
                  {mode === 'demo'
                    ? 'Aucun argent réel engagé'
                    : 'Aucun prélèvement avant signature'}
                </span>
              </div>
              <div id="bet-help" className={`bet-disclaimer ${betError ? 'field-error' : ''}`}>
                {betError ||
                  `Une défaite fait perdre les ${formatAmount(bet)} XLM misés. Une égalité rembourse la mise.${mode === 'demo' ? ' Solde et transactions fictifs.' : ' Des frais réseau s’appliquent à chaque manche.'}`}
              </div>
            </section>
            <section className="how-row" aria-label="Les étapes">
              <div>
                <span>1</span>
                <p>
                  <strong>Choisis ton signe</strong>La pierre, la feuille ou les ciseaux.
                </p>
              </div>
              <ArrowRight size={18} />
              <div>
                <span>2</span>
                <p>
                  <strong>Défie le bot</strong>Un duel. Un résultat. Zéro détour.
                </p>
              </div>
              <ArrowRight size={18} />
              <div>
                <span>3</span>
                <p>
                  <strong>Garde ou remets en jeu</strong>Les gains sont versés automatiquement.
                </p>
              </div>
            </section>
          </>
        ) : (
          <section className="arena-page" aria-labelledby="arena-title">
            <div className="arena-top">
              <button className="text-button" onClick={returnMenu}>
                <ArrowDownLeft size={16} /> Menu principal
              </button>
              <div className="round-stake">
                MISE DE LA MANCHE{' '}
                <strong>
                  {formatAmount(
                    result && ['revealing', 'result'].includes(game.phase) ? result.bet : bet,
                  )}{' '}
                  XLM
                </strong>
              </div>
              <span className="arena-mode">
                {mode === 'demo' ? 'Manche simulée' : 'Paiement automatique'}
              </span>
            </div>
            <div className="arena-heading">
              <span className="eyebrow">PIERRE. FEUILLE. CISEAUX.</span>
              <h1 id="arena-title" ref={heading} tabIndex={-1}>
                {phaseText}
              </h1>
            </div>
            <div className={`duel ${showingResult ? `outcome-${result?.outcome}` : ''}`}>
              <div
                className={`fighter player-fighter ${showingResult && result?.outcome === 'win' ? 'winner' : ''}`}
              >
                <div className="fighter-label">
                  <span>
                    <span className="avatar">T</span> TOI
                  </span>
                  <span>{game.move ? NAMES[game.move] : 'À toi de choisir'}</span>
                </div>
                <div className="fighter-art">
                  {game.move ? (
                    <Hand move={game.move} />
                  ) : (
                    <div className="empty-choice">
                      <span>?</span>
                      <small>Ton prochain coup</small>
                    </div>
                  )}
                </div>
                <div className="fighter-bottom">
                  {showingResult && result?.outcome === 'win' ? (
                    <>
                      <Trophy size={17} /> Bien joué !
                    </>
                  ) : (
                    <>
                      <span className="network-dot" />{' '}
                      {game.move ? 'Choix enregistré' : 'Prêt à jouer'}
                    </>
                  )}
                </div>
              </div>
              <div className="versus">
                VS
                <Spark className="vs-spark" />
              </div>
              <div
                className={`fighter bot-fighter ${showingResult && result?.outcome === 'loss' ? 'winner' : ''}`}
              >
                <div className="fighter-label">
                  <span>
                    <span className="avatar bot-avatar">
                      <Gamepad2 size={18} />
                    </span>{' '}
                    LE BOT
                  </span>
                  <span>{result && showingResult ? NAMES[result.bankMove] : 'Mystère…'}</span>
                </div>
                <div className="fighter-art">
                  <Reel
                    spinning={isRolling}
                    target={
                      result && ['revealing', 'result'].includes(game.phase)
                        ? result.bankMove
                        : null
                    }
                    reduced={reduced}
                  />
                </div>
                <div className="fighter-bottom">
                  {longWait && game.phase === 'pending' ? (
                    <>
                      <LoaderCircle size={16} className="spin" /> Le réseau prend son temps
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      {mode === 'demo'
                        ? 'Scénario de démonstration'
                        : 'Résultat décidé par le contrat'}
                    </>
                  )}
                </div>
              </div>
              {showingResult && result?.outcome === 'win' && !reduced && (
                <div className="confetti" aria-hidden="true">
                  {Array.from({ length: 16 }, (_, i) => (
                    <i key={i} style={{ '--i': i } as React.CSSProperties} />
                  ))}
                </div>
              )}
            </div>
            {showingResult && result ? (
              <div className={`result-panel result-${result.outcome}`} role="status">
                <div className="result-symbol">
                  {result.outcome === 'win' ? (
                    <Trophy />
                  ) : result.outcome === 'tie' ? (
                    <Minus />
                  ) : (
                    <X />
                  )}
                </div>
                <div className="result-copy">
                  <strong>
                    {result.outcome === 'win'
                      ? `${formatAmount(result.payout)} XLM ${mode === 'demo' ? 'fictifs crédités' : 'versés au portefeuille'}`
                      : result.outcome === 'tie'
                        ? `${formatAmount(result.payout)} XLM remboursés`
                        : `${formatAmount(result.bet)} XLM perdus`}
                  </strong>
                  <p>
                    {result.outcome === 'win'
                      ? `Bénéfice : +${formatAmount(result.payout - result.bet)} XLM, hors frais.`
                      : result.outcome === 'tie'
                        ? 'Même mise, nouveau choix. Une nouvelle manche sera nécessaire.'
                        : 'Le solde restant est conservé. Retour au menu…'}
                  </p>
                </div>
                {result.outcome === 'win' && (
                  <div className="result-actions">
                    <button className="button secondary" onClick={returnMenu}>
                      Retour au menu
                    </button>
                    <button
                      className="button primary"
                      onClick={rematch}
                      disabled={blocked || !balanceFresh}
                    >
                      Remiser {formatAmount(result.payout)} XLM <RotateCcw size={16} />
                    </button>
                  </div>
                )}
              </div>
            ) : ['idle', 'error'].includes(game.phase) ? (
              <div className="choice-area">
                <div className="choices">
                  {MOVES.map((move, i) => (
                    <button
                      className={`choice choice-${move}`}
                      key={move}
                      onClick={() => choose(move)}
                      disabled={!playable}
                      aria-label={`Jouer ${NAMES[move]} — miser ${formatAmount(bet)} XLM`}
                    >
                      <span className="choice-index">0{i + 1}</span>
                      <Hand move={move} />
                      <span>
                        <strong>{NAMES[move]}</strong>
                        <small>{beats[move]}</small>
                      </span>
                      <ArrowUpRight size={20} />
                    </button>
                  ))}
                </div>
                <p className="choice-help">
                  {mode === 'demo'
                    ? 'Choisis ton signe pour lancer la manche simulée.'
                    : `Choisir un coup demande une signature Freighter pour miser ${formatAmount(bet)} XLM.`}{' '}
                  <button
                    onClick={() => {
                      returnMenu();
                      setTimeout(() => amountField.current?.focus(), 0);
                    }}
                  >
                    Modifier la mise
                  </button>
                </p>
              </div>
            ) : (
              <div className="transaction-status" role="status">
                <LoaderCircle className="spin" size={21} />
                <div>
                  <strong>{phaseText}</strong>
                  <span>
                    {game.phase === 'signing'
                      ? `Mise : ${formatAmount(bet)} XLM${fee !== null ? ` · plafond de frais estimé : ${formatAmount(fee)} XLM` : ''}`
                      : game.phase === 'revealing'
                        ? 'Opération confirmée. Révélation du résultat.'
                        : 'Tu peux revenir au menu. La manche reste suivie.'}
                  </span>
                </div>
                {pending && !active && (
                  <button className="button secondary small" onClick={resume}>
                    Vérifier à nouveau <RotateCcw size={15} />
                  </button>
                )}
              </div>
            )}
            {transactionUrl && (
              <a
                className="transaction-link"
                href={transactionUrl}
                target="_blank"
                rel="noreferrer"
              >
                {hash.slice(0, 8)}…{hash.slice(-6)} · Voir la transaction <ExternalLink size={12} />
              </a>
            )}
          </section>
        )}

        <div className="balance-bar">
          <span>
            <Wallet size={18} />
            <span>{mode === 'demo' ? 'TON SOLDE FICTIF' : 'SOLDE DU PORTEFEUILLE'}</span>
            <strong>
              {balance
                ? mode === 'testnet'
                  ? formatBalance(balance.total)
                  : formatAmount(balance.total)
                : '—'}{' '}
              <small>XLM</small>
            </strong>
            {mode === 'testnet' && !balanceFresh && <em>À actualiser</em>}
          </span>
          <div>
            {mode === 'testnet' && address && (
              <button className="text-button" onClick={() => refreshBalance()} disabled={active}>
                <RotateCcw size={13} /> Actualiser
              </button>
            )}
            <span>
              {mode === 'demo'
                ? '100 XLM offerts pour explorer le jeu.'
                : balance
                  ? `${formatAmount(balance.available)} XLM disponibles avant frais.`
                  : 'Connecte ton portefeuille pour lire ton solde.'}
            </span>
          </div>
        </div>
      </main>
      <footer>
        <span className="footer-brand">
          strock<span>.</span>
        </span>
        <span>Un classique. Une nouvelle façon de jouer.</span>
        <div>
          <span className="stellar-credit">
            <span>✳</span> Construit sur Stellar
          </span>
          <span className="footer-separator" />
          <button onClick={() => setDialog(mode === 'demo' ? 'demo' : 'settings')}>
            <Settings2 size={15} />
            {mode === 'demo' ? 'Commandes démo' : 'Préférences'}
          </button>
        </div>
      </footer>

      {dialog === 'rules' && (
        <Dialog title="Trois signes. Les mêmes règles." onClose={() => setDialog(null)}>
          <div className="rule-cards">
            {MOVES.map((move) => (
              <div key={move}>
                <Hand move={move} />
                <strong>{NAMES[move]}</strong>
                <span>{beats[move]}</span>
              </div>
            ))}
          </div>
          <p>
            Choisis une mise, puis ton signe. Si tu gagnes, le contrat verse deux fois ta mise. En
            cas d’égalité, il la rembourse. Si tu perds, elle est perdue.
          </p>
          <div className="dialog-callout">
            <ShieldCheck size={22} />
            <p>
              <strong>Les gains arrivent automatiquement.</strong>« Remiser » prépare une nouvelle
              manche. Chaque manche Testnet exige une signature et peut entraîner des frais.
            </p>
          </div>
          <p className="muted">
            strock est un prototype sur Stellar Testnet. Les XLM de test n’ont pas de valeur réelle.
            Le hasard du contrat n’est pas conçu pour un jeu d’argent en production.
          </p>
          <button className="button primary full" onClick={() => setDialog(null)}>
            C’est compris <Check size={18} />
          </button>
        </Dialog>
      )}
      {(dialog === 'demo' || dialog === 'settings') && (
        <Dialog
          title={dialog === 'demo' ? 'Aux commandes de la démo' : 'Préférences'}
          onClose={() => setDialog(null)}
        >
          {dialog === 'demo' && (
            <>
              <p>
                Une démonstration autonome, sans portefeuille et sans argent réel. Choisis le
                scénario de la prochaine manche.
              </p>
              <label className="form-label" htmlFor="scenario">
                SCÉNARIO
              </label>
              <select
                id="scenario"
                value={scenario}
                onChange={(e) => setScenario(e.target.value as Scenario)}
                disabled={blocked}
              >
                {scenarios.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                className="button secondary full reset-demo"
                disabled={active}
                onClick={() => {
                  timers.current.forEach(clearTimeout);
                  demo.reset();
                  setBalance({ total: 100n * UNIT, available: 100n * UNIT });
                  setBalanceFresh(true);
                  setPending(false);
                  setScreen('menu');
                  setBetText('10');
                  dispatch({ type: 'reset' });
                  setNotice('Démo réinitialisée : 100 XLM fictifs, prêts à jouer.');
                  setDialog(null);
                }}
              >
                <RotateCcw size={17} /> Réinitialiser à 100 XLM fictifs
              </button>
            </>
          )}
          <label className="toggle-row">
            <span>
              <strong>Réduire les animations</strong>
              <small>Révélation directe, sans défilement ni confettis.</small>
            </span>
            <input
              type="checkbox"
              checked={reduced}
              onChange={(e) => {
                setReduced(e.target.checked);
                localStorage.setItem('strock:motion', e.target.checked ? 'reduce' : 'normal');
              }}
            />
          </label>
          <div className="dialog-callout">
            <Monitor size={22} />
            <p>
              Interface conçue pour ordinateur. Agrandis la fenêtre ; utilise F11 si ton navigateur
              propose le plein écran.
            </p>
          </div>
          {mode === 'testnet' && address && (
            <button
              className="button secondary full"
              onClick={async () => {
                await navigator.clipboard.writeText(address);
                setCopied(true);
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
              {copied ? 'Adresse copiée' : 'Copier mon adresse publique'}
            </button>
          )}
        </Dialog>
      )}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {game.phase === 'result' && result
          ? `${result.outcome === 'win' ? 'Victoire' : result.outcome === 'tie' ? 'Égalité' : 'Défaite'}. Tu as joué ${NAMES[result.playerMove]}, le bot ${NAMES[result.bankMove]}. ${formatAmount(result.payout)} XLM reçus.`
          : phaseText}
      </div>
    </div>
  );
}
