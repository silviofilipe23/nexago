import type { PredictionLeaderboardRow } from './predictions.selectors';

/**
 * Dados do compartilhamento do ranking de palpites — texto, link e o que vai na imagem.
 *
 * Módulo puro: sem Angular, sem Firestore, sem canvas. O desenho em si mora em
 * `predictions-share-card.ts`; aqui fica a decisão do QUE mostrar, que é a parte com regra de
 * negócio e a que dá para testar sem DOM.
 */

/** Quantas posições do topo entram na imagem. */
export const SHARE_TOP_COUNT = 3;

export interface PredictionShareRow {
  rank: number;
  name: string;
  score: number;
  isMe: boolean;
}

export interface PredictionShareData {
  tournamentName: string | null;
  /** O pódio — até três linhas. Menos que isso quando ainda tem pouca gente palpitando. */
  top: PredictionShareRow[];
  /** A linha do próprio atleta, SÓ quando ele está fora do pódio (senão apareceria duplicada). */
  me: PredictionShareRow | null;
  totalPlayers: number;
  /** Vai impressa no rodapé do card, sem `https://` para não virar uma linha de código. */
  urlLabel: string;
}

/** "Marcelo Antunes" → "Marcelo A." — mesmo encurtamento do protótipo. Preserva o primeiro nome
 *  inteiro (é como a pessoa se reconhece) e reduz o resto à inicial. */
export function shortDisplayName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'Atleta';
  const [first, ...rest] = parts;
  const last = rest.at(-1);
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first;
}

/** `/torneios/{id}/palpites` no portal do atleta. A rota é protegida, mas o `authGuard` carrega o
 *  destino em `?redirect=` e atravessa o onboarding — quem não tem conta cadastra e cai aqui. */
export function predictionShareUrl(origin: string, tournamentId: string): string {
  const base = origin.replace(/\/+$/, '') || 'https://atleta.nexago.com.br';
  return `${base}/torneios/${tournamentId.trim()}/palpites`;
}

function labelOf(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

export function buildPredictionShareData(params: {
  tournamentName: string | null;
  leaderboard: readonly PredictionLeaderboardRow[];
  nameOf: (userId: string) => string | null;
  url: string;
}): PredictionShareData {
  const rowOf = (row: PredictionLeaderboardRow): PredictionShareRow => ({
    rank: row.rank,
    name: shortDisplayName(params.nameOf(row.userId)),
    score: row.score,
    isMe: row.isMe,
  });

  const top = params.leaderboard.slice(0, SHARE_TOP_COUNT).map(rowOf);
  const myRow = params.leaderboard.find((row) => row.isMe) ?? null;

  return {
    tournamentName: params.tournamentName?.trim() || null,
    top,
    // Dentro do pódio a linha destacada já é a dele; repetir embaixo seria a mesma pessoa duas vezes.
    me: myRow && myRow.rank > SHARE_TOP_COUNT ? rowOf(myRow) : null,
    totalPlayers: params.leaderboard.length,
    urlLabel: labelOf(params.url),
  };
}

/** Legenda que acompanha a imagem na folha nativa. Curta de propósito: no WhatsApp o texto longo
 *  come o espaço do preview. */
export function predictionShareText(data: PredictionShareData, url: string): string {
  const where = data.tournamentName ? ` do ${data.tournamentName}` : '';
  if (data.me) {
    return `Estou em #${data.me.rank} no ranking de palpites${where}. Dá o seu: ${url}`;
  }
  const leader = data.top[0];
  if (leader?.isMe) {
    return `Estou liderando o ranking de palpites${where}. Vem tentar: ${url}`;
  }
  if (leader) {
    return `${leader.name} lidera o ranking de palpites${where}. Dá o seu: ${url}`;
  }
  return `Ranking de palpites${where}: ${url}`;
}

export function predictionShareFileName(tournamentName: string | null): string {
  const slug = (tournamentName ?? '')
    .toLowerCase()
    .normalize('NFD')
    // Remove os diacríticos decompostos pelo NFD (bloco combining diacritical marks). Escrito com
    // escapes: o range literal são caracteres combinantes e gruda no caractere anterior do fonte.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `nexago-palpites-${slug || 'ranking'}.png`;
}
