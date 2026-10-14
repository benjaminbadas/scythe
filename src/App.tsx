import { useEffect, useRef, useState } from 'react';
import { apply, newGame, randomSeed, type GameState } from './engine';
import { requestPlan, stepDelay } from './ai/client';
import { CODE_PATTERN, type RoomView } from './online/api';
import { GameScreen, turnKey } from './ui/GameScreen';
import { OnlineRoom } from './ui/OnlineRoom';
import { Setup } from './ui/Setup';
import { loadGame, saveGame } from './save';

/** Code de salle présent dans l'adresse (lien partagé : …/#K7P2Q). */
function codeFromHash(): string | null {
  const code = location.hash.slice(1).toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export function App() {
  const [game, setGame] = useState<GameState | null>(() => loadGame());
  const [turnStart, setTurnStart] = useState<GameState | null>(game);
  const [online, setOnline] = useState<{ code: string; room?: RoomView } | null>(null);
  const [invite, setInvite] = useState<string | null>(() => codeFromHash());
  /** Relance l'IA quand son plan s'arrête sans que la main ait changé. */
  const [aiNonce, setAiNonce] = useState(0);

  useEffect(() => saveGame(game), [game]);

  // Tour d'un joueur IA : le plan est calculé à part, puis joué geste par geste.
  const gameRef = useRef(game);
  gameRef.current = game;
  const aiKey =
    game && !online && game.status === 'playing' && game.turn && game.players[game.turn.player].ai ? `${turnKey(game)}-${aiNonce}` : null;
  useEffect(() => {
    if (!aiKey) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const start = gameRef.current!;
    requestPlan(start).then((plan) => {
      if (cancelled) return;
      let cur = start;
      let at = 0;
      const steps = plan.length ? plan : [{ t: 'endTurn' } as const];
      steps.forEach((a, k) => {
        at += stepDelay(a);
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            try {
              cur = apply(cur, a);
            } catch {
              // Coup refusé (ne devrait pas arriver) : l'IA tente de finir son tour.
              try {
                cur = apply(cur, { t: 'endTurn' });
              } catch {
                setAiNonce((n) => n + 1);
                return;
              }
            }
            setGame(cur);
            setTurnStart(cur);
            if (k === steps.length - 1 && turnKey(cur) === turnKey(start)) setAiNonce((n) => n + 1);
          }, at),
        );
      });
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [aiKey, online]);
  useEffect(() => {
    const onHash = () => setInvite(codeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (online) {
    return (
      <OnlineRoom
        key={online.code}
        code={online.code}
        initialRoom={online.room}
        onLeave={() => {
          history.replaceState(null, '', location.pathname);
          setOnline(null);
          setInvite(null);
        }}
      />
    );
  }

  if (!game) {
    return (
      <Setup
        invite={invite}
        onOnline={(code, room) => {
          history.replaceState(null, '', `#${code}`);
          setOnline({ code, room });
        }}
        onStart={({ names, ai, factions, mats }) => {
          const s = newGame(names, randomSeed(), { ai, factions, mats });
          setGame(s);
          setTurnStart(s);
        }}
      />
    );
  }

  return (
    <GameScreen
      game={game}
      seat={null}
      onPlay={(next) => {
        if (!turnStart || turnKey(next) !== turnKey(turnStart)) setTurnStart(next);
        setGame(next);
      }}
      onUndo={turnStart && turnKey(turnStart) === turnKey(game) && turnStart !== game ? () => setGame(turnStart) : undefined}
      onQuit={() => {
        if (game.status === 'finished' || confirm('Abandonner la partie en cours ?')) {
          setGame(null);
          setTurnStart(null);
        }
      }}
    />
  );
}
