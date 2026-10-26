import type { PillTone } from '../../ui/pill.component';
import type { TournamentStatus } from './tournaments.repository';

/** Rótulo e tom do status do torneio nas tabelas do backoffice (Todos os torneios, Taxas). */
export const STATUS_LABEL: Record<TournamentStatus, string> = {
  inscricoes: 'Inscrições',
  encerradas: 'Inscrições encerradas',
  andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const STATUS_TONE: Record<TournamentStatus, PillTone> = {
  inscricoes: 'yellow',
  encerradas: 'dim',
  andamento: 'orange',
  concluido: 'green',
  cancelado: 'red',
};
