import { ATLETAS } from './atletas';
import { ORGANIZADORES } from './organizadores';
import { ARENAS } from './arenas';
import { buildSearchIndex } from './search';
import type { DocAudience } from './types';

export const DOC_AUDIENCES: DocAudience[] = [ATLETAS, ORGANIZADORES, ARENAS];

export const SEARCH_INDEX = buildSearchIndex(DOC_AUDIENCES);

/** Atalhos do índice /docs para os fluxos mais procurados. */
export const POPULAR_FLOWS: { title: string; audience: string; href: string }[] = [
  { title: 'Inscrever a dupla em um torneio', audience: 'Atletas', href: '/docs/atletas#inscricao-em-torneios' },
  { title: 'Pagar a inscrição com PIX', audience: 'Atletas', href: '/docs/atletas#pagamento-da-inscricao' },
  { title: 'Gerar as chaves do torneio', audience: 'Organizadores', href: '/docs/organizadores#chaves-e-grupos' },
  { title: 'Agendar jogos por quadra automaticamente', audience: 'Organizadores', href: '/docs/organizadores#agendamento-de-jogos' },
  { title: 'Abrir a agenda de reservas da arena', audience: 'Arenas', href: '/docs/arenas#agenda-e-reservas' },
  { title: 'Cancelar uma inscrição', audience: 'Atletas', href: '/docs/atletas#cancelamento-de-inscricao' },
];
