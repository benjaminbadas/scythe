import { useCallback, useEffect, useRef, useState } from 'react';
import { newGame, randomSeed, type GameState } from '../engine';
import { OnlineError, type RoomView, api, onlineMemory, shareUrl } from '../online/api';
import { GameScreen, turnKey } from './GameScreen';

const POLL_MS = 2000;

const ERRORS: Record<string, string> = {
  network: 'Connexion au serveur impossible. Nouvel essai en cours…',
  notFound: 'Cette partie n’existe pas ou a expiré.',
  started: 'La partie a déjà commencé.',
  full: 'La partie est complète (5 joueurs).',
  notHost: 'Seul le créateur de la partie peut la lancer.',
  tooFew: 'Il faut au moins 2 joueurs.',
  conflict: 'Un autre joueur a joué entre-temps : la partie a été mise à jour.',
  notYourTurn: 'Ce n’est pas votre tour.',
  over: 'La partie est terminée.',
  rateLimited: 'Trop de requêtes : patientez un instant.',
  busy: 'Le serveur est plein, réessayez plus tard.',
  tooLarge: 'État de partie trop volumineux.',
  invalid: 'Requête invalide.',
  storage: 'Erreur d’enregistrement sur le serveur.',
};

export function describeError(e: unknown): string {
  const code = e instanceof OnlineError ? e.code : 'network';
  return ERRORS[code] ?? ERRORS.network;
}

interface Props {
  code: string;
  initialRoom?: RoomView;
  onLeave: () => void;
}

/** Partie en ligne : salle d'attente, puis plateau synchronisé. Le tour se prépare sur le téléphone et part à la fin du tour. */
export function OnlineRoom({ code, initialRoom, onLeave }: Props) {
  const [room, setRoom] = useState<RoomView | null>(initialRoom ?? null);
  /** Tour en préparation sur ce téléphone (pas encore envoyé). */
  const [draft, setDraft] = useState<GameState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sending = useRef(false);
  const roomRef = useRef(room);
  roomRef.current = room;

  const poll = useCallback(async () => {
    const fresh = await api.poll(code, roomRef.current?.version);
    if (fresh && !sending.current) {
      setRoom(fresh);
      setDraft(null);
    }
  }, [code]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!sending.current) {
        try {
          await poll();
          if (!stopped) setNotice((n) => (n === ERRORS.network ? null : n));
        } catch (e) {
          if (stopped) return;
          if (e instanceof OnlineError && e.code === 'notFound') {
            onlineMemory.setRoom(null);
            setNotice(ERRORS.notFound);
            return;
          }
          setNotice(describeError(e));
        }
      }
      if (!stopped) timer = setTimeout(tick, document.hidden ? POLL_MS * 4 : POLL_MS);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [poll]);

  async function submit(next: GameState) {
    const before = roomRef.current!;
    setRoom({ ...before, state: next });
    setDraft(null);
    sending.current = true;
    try {
      setRoom(await api.act(code, before.version, next));
      setNotice(null);
    } catch (e) {
      setRoom(e instanceof OnlineError && e.room ? e.room : before);
      setNotice(describeError(e));
    } finally {
      sending.current = false;
    }
  }

  async function start() {
    const current = roomRef.current!;
    try {
      setRoom(await api.start(code, newGame(current.seats.map((s) => s.name), randomSeed())));
      setNotice(null);
    } catch (e) {
      setNotice(describeError(e));
    }
  }

  async function leaveLobby() {
    try {
      await api.leave(code);
    } catch {
      // La place se libérera quand la salle expirera.
    }
    onlineMemory.setRoom(null);
    onLeave();
  }

  async function share() {
    const url = shareUrl(code);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Scythe', text: 'Rejoins ma partie de Scythe', url });
        return;
      }
    } catch {
      // Partage annulé : on copie le lien à la place.
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Le lien reste affiché.
    }
  }

  if (room?.status === 'playing' && room.state) {
    if (room.you < 0) {
      return (
        <div className="setup">
          <p>Vous ne faites pas partie de cette partie.</p>
          <button className="primary" onClick={onLeave}>
            Retour à l’accueil
          </button>
        </div>
      );
    }
    const server = room.state as GameState;
    const shown = draft ?? server;
    return (
      <>
        {notice && <p className="notice">{notice}</p>}
        <GameScreen
          game={shown}
          seat={room.you}
          onPlay={(next) => {
            // Le tour part au serveur quand il est terminé ; avant, il reste sur ce téléphone.
            if (turnKey(next) !== turnKey(server)) submit(next);
            else setDraft(next);
          }}
          onUndo={draft ? () => setDraft(null) : undefined}
          onQuit={() => {
            if (server.status === 'finished') onlineMemory.setRoom(null);
            onLeave();
          }}
        />
      </>
    );
  }

  const isHost = room?.you === 0;
  return (
    <div className="setup lobby">
      <h1>Partie en ligne</h1>
      <p className="lead">Partagez ce code ou ce lien avec vos amis (2 à 5 joueurs).</p>
      <div className="room-code" aria-label="Code de la partie">
        {code}
      </div>
      <div className="row">
        <button onClick={share}>{copied ? 'Lien copié !' : 'Partager le lien'}</button>
        <code className="muted small">{shareUrl(code)}</code>
      </div>
      <section className="panel">
        <h2>Joueurs ({room?.seats.length ?? 0}/5)</h2>
        <ol className="seats">
          {room?.seats.map((s, i) => (
            <li key={i}>
              {s.name}
              {i === 0 && <small className="muted"> — crée la partie</small>}
              {i === room.you && <small className="muted"> (vous)</small>}
            </li>
          ))}
        </ol>
        {isHost ? (
          <button className="primary big" disabled={(room?.seats.length ?? 0) < 2} onClick={start}>
            Lancer la partie
          </button>
        ) : (
          <p className="muted">En attente du lancement par {room?.seats[0]?.name ?? 'l’hôte'}…</p>
        )}
      </section>
      {notice && <p className="error">{notice}</p>}
      <button className="ghost" onClick={leaveLobby}>
        Quitter la salle
      </button>
    </div>
  );
}
