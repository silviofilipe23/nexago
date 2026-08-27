export const STORAGE_KEY = 'nx:torneios-seguidos';
const MAX_FOLLOWED = 20;

/** Bookmark local de torneios seguidos, sem conta — grava só no navegador do espectador.
 *  Nunca lança: `localStorage` bloqueado (modo privado, cota) vira no-op silencioso.
 *  `STORAGE_KEY` é exportada só pra specs inspecionarem/limparem o `localStorage` real —
 *  nenhum código de produção fora deste arquivo deve ler a chave direto. */
export function getFollowedTournamentIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function isFollowing(id: string): boolean {
  return getFollowedTournamentIds().includes(id);
}

/** Retorna o novo estado (`true` = passou a seguir). Falha de escrita não muda nada:
 *  retorna o estado que já existia antes da tentativa. */
export function toggleFollow(id: string): boolean {
  const current = getFollowedTournamentIds();
  const wasFollowing = current.includes(id);
  const next = wasFollowing
    ? current.filter((existing) => existing !== id)
    : [id, ...current].slice(0, MAX_FOLLOWED);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return !wasFollowing;
  } catch {
    return wasFollowing;
  }
}
