/**
 * Coleção Firestore: `torneios/{id}`
 * Campos denormalizados (sem joins): nome, arenaNome, contagens de partidas, status, datas.
 * O campo `status` deve ser mantido por processo de backend (Cloud Functions / jobs), não recalculado no cliente em escala.
 */
export type TorneioStatus = 'EM_ANDAMENTO' | 'ATRASADO' | 'FINALIZADO';

export const TORNEIO_STATUS = {
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  ATRASADO: 'ATRASADO',
  FINALIZADO: 'FINALIZADO',
} as const satisfies Record<TorneioStatus, TorneioStatus>;

export interface Torneio {
  id: string;
  nome: string;
  arenaNome: string;
  dataInicio: Date;
  dataFim: Date;
  status: TorneioStatus;
  totalPartidas: number;
  partidasConcluidas: number;
  updatedAt: Date;
}

export interface TorneioProgresso {
  /** Ex.: "12 / 20 partidas" */
  rotulo: string;
  /** 0–100 */
  percentual: number;
}

export function progressoDoTorneio(t: Torneio): TorneioProgresso {
  const total = t.totalPartidas;
  const feitas = t.partidasConcluidas;
  const percentual = total > 0 ? Math.round((feitas / total) * 100) : 0;
  return {
    rotulo: `${feitas} / ${total} partidas`,
    percentual,
  };
}
