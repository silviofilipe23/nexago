/** Dados fictícios do protótipo — telas mockadas, sem integração com backend ainda. */

export type PillTone = 'orange' | 'green' | 'yellow' | 'red' | 'dim';

export interface OgEvento {
  id: string;
  name: string;
  kind: 'Liga' | 'Torneio';
  sport: string;
  status: 'em-andamento' | 'inscricoes' | 'concluido';
  inscritos: number;
  vagas: number;
  receita: number;
  jogos: number;
  jogosFeitos: number;
  inicio: string;
  fim: string;
}

export const OG_EVENTOS: OgEvento[] = [
  { id: 'liga-bt', name: 'Liga Municipal de Beach Tennis', kind: 'Liga', sport: 'Beach Tennis', status: 'em-andamento', inscritos: 64, vagas: 64, receita: 9600, jogos: 42, jogosFeitos: 26, inicio: '02 Mar', fim: '20 Dez' },
  { id: 'copa-bv', name: 'Copa Verão Beach Vôlei', kind: 'Torneio', sport: 'Vôlei de praia', status: 'inscricoes', inscritos: 20, vagas: 32, receita: 1400, jogos: 0, jogosFeitos: 0, inicio: '04 Ago', fim: '05 Ago' },
  { id: 'relampago', name: 'Torneio Relâmpago de Padel', kind: 'Torneio', sport: 'Padel', status: 'inscricoes', inscritos: 18, vagas: 24, receita: 1080, jogos: 0, jogosFeitos: 0, inicio: '21 Jul', fim: '21 Jul' },
  { id: 'abertura', name: 'Torneio de Abertura', kind: 'Torneio', sport: 'Beach Tennis', status: 'concluido', inscritos: 16, vagas: 16, receita: 960, jogos: 15, jogosFeitos: 15, inicio: '02 Mai', fim: '03 Mai' },
];

export const OG_STATUS_TONE: Record<OgEvento['status'], PillTone> = {
  'em-andamento': 'green',
  inscricoes: 'orange',
  concluido: 'dim',
};

export const OG_STATUS_LABEL: Record<OgEvento['status'], string> = {
  'em-andamento': 'Em andamento',
  inscricoes: 'Inscrições abertas',
  concluido: 'Concluído',
};

export interface OgdCategoria {
  id: string;
  name: string;
  tags: string[];
  taken: number;
  total: number;
  pagas: number;
  pend: number;
  receita: string;
  full: boolean;
  hint?: string;
}

export const OGD_CATEGORIAS: OgdCategoria[] = [
  { id: 'mo', name: 'Masculino Open', tags: ['Masculino', 'Dupla', 'Avançado'], taken: 16, total: 16, pagas: 14, pend: 2, receita: 'R$ 2.520', full: true, hint: 'Inscrições lotadas · pronto pra sortear a chave' },
  { id: 'fo', name: 'Feminino Open', tags: ['Feminino', 'Dupla', 'Avançado'], taken: 11, total: 16, pagas: 10, pend: 1, receita: 'R$ 1.980', full: false },
  { id: 'mb', name: 'Misto B', tags: ['Misto', 'Dupla', 'Intermediário'], taken: 7, total: 16, pagas: 6, pend: 1, receita: 'R$ 1.260', full: false },
];

export interface OgdDupla {
  seed?: number;
  order?: number;
  names: string;
  meta: string;
  pay: 'pago' | 'pendente' | 'espera';
}

export const OGD_DUPLAS: OgdDupla[] = [
  { seed: 1, names: 'Martins / Silva', meta: 'Ranking #4', pay: 'pago' },
  { seed: 2, names: 'Costa / Reis', meta: 'Ranking #7', pay: 'pago' },
  { order: 3, names: 'Ferreira / Duarte', meta: 'Ranking #12', pay: 'pendente' },
  { order: 4, names: 'Nunes / Alves', meta: 'Ranking #15', pay: 'pago' },
  { order: 5, names: 'Vieira / Rocha', meta: 'Sem ranking', pay: 'pago' },
  { order: 6, names: 'Prado / Lima', meta: 'Sem ranking', pay: 'espera' },
];

export interface OgdSeed {
  pos: number;
  names: string;
  pts: number;
}

export const OGD_SEEDS: OgdSeed[] = [
  { pos: 1, names: 'Martins / Silva', pts: 1240 },
  { pos: 2, names: 'Costa / Reis', pts: 1105 },
  { pos: 3, names: 'Ferreira / Duarte', pts: 980 },
  { pos: 4, names: 'Nunes / Alves', pts: 940 },
  { pos: 5, names: 'Vieira / Rocha', pts: 860 },
  { pos: 6, names: 'Prado / Lima', pts: 810 },
  { pos: 7, names: 'Ana / Bia', pts: 770 },
  { pos: 8, names: 'Carla / Duda', pts: 705 },
];

export const OGD_UNSEEDED = ['Rafael / João', 'Marcos / Tiago', 'Equipe Norte', 'Equipe Sul'];

export interface OgInscrito {
  name: string;
  evento: string;
  categoria: string;
  pay: 'pago' | 'pendente' | 'estornado';
  date: string;
}

export const OG_INSCRITOS: OgInscrito[] = [
  { name: 'Duo Martins / Silva', evento: 'Liga Beach Tennis', categoria: 'Open Misto', pay: 'pago', date: '02 Jul' },
  { name: 'Duo Costa / Reis', evento: 'Liga Beach Tennis', categoria: 'Open Misto', pay: 'pago', date: '03 Jul' },
  { name: 'Ana Ferreira / Bia Duarte', evento: 'Copa Verão Beach Vôlei', categoria: 'Feminino', pay: 'pendente', date: '10 Jul' },
  { name: 'Carla Nunes / Duda Alves', evento: 'Copa Verão Beach Vôlei', categoria: 'Feminino', pay: 'pago', date: '11 Jul' },
  { name: 'Equipe Norte', evento: 'Liga Beach Tennis', categoria: 'Equipes', pay: 'pago', date: '05 Jul' },
  { name: 'Equipe Sul', evento: 'Liga Beach Tennis', categoria: 'Equipes', pay: 'pendente', date: '06 Jul' },
  { name: 'Rafael Lima / João Prado', evento: 'Torneio Relâmpago de Padel', categoria: 'Open', pay: 'pago', date: '12 Jul' },
  { name: 'Marcos Vieira / Tiago Rocha', evento: 'Torneio Relâmpago de Padel', categoria: 'Open', pay: 'estornado', date: '13 Jul' },
];

export const OG_PAY_TONE: Record<OgInscrito['pay'], PillTone> = { pago: 'green', pendente: 'yellow', estornado: 'red' };
export const OG_PAY_LABEL: Record<OgInscrito['pay'], string> = { pago: 'Pago', pendente: 'Pendente', estornado: 'Estornado' };

export interface OgGrupoTime {
  name: string;
  v: number;
  d: number;
  sets: string;
  pts: number;
  classified: boolean;
}

export interface OgGrupo {
  id: string;
  teams: OgGrupoTime[];
}

export const OG_GRUPOS: OgGrupo[] = [
  { id: 'A', teams: [
    { name: 'Martins/Silva', v: 3, d: 0, sets: '6-1', pts: 9, classified: true },
    { name: 'Ferreira/Duarte', v: 2, d: 1, sets: '5-3', pts: 6, classified: true },
    { name: 'Vieira/Rocha', v: 1, d: 2, sets: '3-5', pts: 3, classified: false },
    { name: 'Prado/Lima', v: 0, d: 3, sets: '1-6', pts: 0, classified: false },
  ] },
  { id: 'B', teams: [
    { name: 'Costa/Reis', v: 3, d: 0, sets: '6-2', pts: 9, classified: true },
    { name: 'Nunes/Alves', v: 2, d: 1, sets: '5-4', pts: 6, classified: true },
    { name: 'Equipe Norte', v: 1, d: 2, sets: '4-5', pts: 3, classified: false },
    { name: 'Equipe Leste', v: 0, d: 3, sets: '2-6', pts: 0, classified: false },
  ] },
  { id: 'C', teams: [
    { name: 'Ana/Bia', v: 2, d: 1, sets: '5-3', pts: 6, classified: true },
    { name: 'Carla/Duda', v: 2, d: 1, sets: '4-3', pts: 6, classified: true },
    { name: 'Rafael/João', v: 1, d: 2, sets: '3-4', pts: 3, classified: false },
    { name: 'Marcos/Tiago', v: 1, d: 2, sets: '3-5', pts: 3, classified: false },
  ] },
];

export interface OgBracketMatch {
  a: string;
  b: string;
  sa: number | string;
  sb: number | string;
  done: boolean;
}

export interface OgBracketRound {
  round: string;
  matches: OgBracketMatch[];
}

export const OG_BRACKET: OgBracketRound[] = [
  { round: 'Oitavas', matches: [
    { a: 'Martins/Silva', b: 'Prado/Lima', sa: 2, sb: 0, done: true },
    { a: 'Costa/Reis', b: 'Vieira/Rocha', sa: 2, sb: 1, done: true },
    { a: 'Ferreira/Duarte', b: 'Nunes/Alves', sa: 1, sb: 2, done: true },
    { a: 'Equipe Norte', b: 'Equipe Leste', sa: 2, sb: 0, done: true },
  ] },
  { round: 'Quartas', matches: [
    { a: 'Martins/Silva', b: 'Costa/Reis', sa: 2, sb: 1, done: true },
    { a: 'Nunes/Alves', b: 'Equipe Norte', sa: '–', sb: '–', done: false },
  ] },
  { round: 'Semifinal', matches: [
    { a: 'Martins/Silva', b: '?', sa: '–', sb: '–', done: false },
  ] },
  { round: 'Final', matches: [
    { a: '?', b: '?', sa: '–', sb: '–', done: false },
  ] },
];

export interface OgJogo {
  time: string;
  a: string;
  b: string;
  quadra: string;
  status: 'encerrado' | 'ao-vivo' | 'agendado';
  sa: number | string;
  sb: number | string;
}

export const OG_JOGOS: OgJogo[] = [
  { time: '09:00', a: 'Martins/Silva', b: 'Costa/Reis', quadra: 'Quadra 2', status: 'encerrado', sa: 2, sb: 1 },
  { time: '10:30', a: 'Equipe Norte', b: 'Equipe Leste', quadra: 'Quadra 1', status: 'encerrado', sa: 2, sb: 0 },
  { time: '14:00', a: 'Ana/Bia', b: 'Carla/Duda', quadra: 'Quadra 3', status: 'ao-vivo', sa: 1, sb: 1 },
  { time: '15:30', a: 'Nunes/Alves', b: 'Equipe Norte', quadra: 'Quadra 1', status: 'agendado', sa: '–', sb: '–' },
  { time: '17:00', a: 'Rafael/João', b: 'Marcos/Tiago', quadra: 'Quadra 2', status: 'agendado', sa: '–', sb: '–' },
];

export const OG_JOGO_TONE: Record<OgJogo['status'], PillTone> = { encerrado: 'dim', 'ao-vivo': 'red', agendado: 'orange' };
export const OG_JOGO_LABEL: Record<OgJogo['status'], string> = { encerrado: 'Encerrado', 'ao-vivo': 'Ao vivo', agendado: 'Agendado' };

export interface OgaBloco {
  start: number;
  dur: number;
  partida: string;
  status: 'confirmada' | 'pendente';
}

export const OGA_START = 8 * 60;
export const OGA_END = 20 * 60;
export const OGA_SLOT = 30;
export const OGA_ROW_H = 32;
export const OGA_QUADRAS = [
  { id: 'q1', name: 'Quadra 1' },
  { id: 'q2', name: 'Quadra 2' },
  { id: 'q3', name: 'Quadra 3' },
  { id: 'q4', name: 'Quadra 4' },
];

export const OGA_BLOCKS: Record<string, OgaBloco[]> = {
  q1: [
    { start: 9 * 60, dur: 60, partida: 'Martins/Silva vs Costa/Reis', status: 'confirmada' },
    { start: 15 * 60 + 30, dur: 60, partida: 'Nunes/Alves vs Equipe Norte', status: 'pendente' },
  ],
  q2: [{ start: 10 * 60 + 30, dur: 60, partida: 'Equipe Norte vs Equipe Leste', status: 'confirmada' }],
  q3: [{ start: 14 * 60, dur: 60, partida: 'Ana/Bia vs Carla/Duda', status: 'confirmada' }],
  q4: [],
};

export const OGA_FILA = [
  { partida: 'Ferreira/Duarte vs Vieira/Rocha', evento: 'Liga Beach Tennis', categoria: 'Open Misto' },
  { partida: 'Rafael/João vs Marcos/Tiago', evento: 'Torneio Relâmpago de Padel', categoria: 'Open' },
  { partida: 'Equipe Sul vs Equipe Norte', evento: 'Liga Beach Tennis', categoria: 'Equipes' },
];

export interface OgTransacao {
  desc: string;
  evento: string;
  date: string;
  value: number;
  tone: 'green' | 'dim' | 'red';
}

export const OG_TRANSACOES: OgTransacao[] = [
  { desc: 'Inscrição · Martins/Silva', evento: 'Liga Beach Tennis', date: '02 Jul', value: 150, tone: 'green' },
  { desc: 'Inscrição · Costa/Reis', evento: 'Liga Beach Tennis', date: '03 Jul', value: 150, tone: 'green' },
  { desc: 'Taxa NexaGO (6%)', evento: 'Plataforma', date: '03 Jul', value: -63, tone: 'dim' },
  { desc: 'Inscrição · Nunes/Alves', evento: 'Copa Verão Beach Vôlei', date: '11 Jul', value: 70, tone: 'green' },
  { desc: 'Estorno · Vieira/Rocha', evento: 'Torneio Relâmpago de Padel', date: '13 Jul', value: -60, tone: 'red' },
  { desc: 'Saque para conta bancária', evento: 'Liga Amadora Goiânia', date: '14 Jul', value: -2400, tone: 'dim' },
];

export interface OgAviso {
  title: string;
  body: string;
  evento: string;
  date: string;
  alcance: number;
}

export const OG_AVISOS: OgAviso[] = [
  { title: 'Rodada 5 publicada', body: 'Confira os horários e quadras da próxima rodada da Liga Beach Tennis.', evento: 'Liga Beach Tennis', date: 'ontem, 18:20', alcance: 64 },
  { title: 'Lembrete de pagamento', body: '3 inscrições estão com pagamento pendente há mais de 48h.', evento: 'Copa Verão Beach Vôlei', date: 'há 2 horas', alcance: 3 },
  { title: 'Mudança de quadra', body: 'A partida das 15:30 foi remanejada para a Quadra 2 por manutenção.', evento: 'Torneio Relâmpago de Padel', date: '11 Jul', alcance: 24 },
];

export interface OgMensagem {
  name: string;
  preview: string;
  time: string;
  unread: boolean;
}

export const OG_MENSAGENS: OgMensagem[] = [
  { name: 'Ana Ferreira', preview: 'Posso trocar minha dupla até sexta?', time: '09:14', unread: true },
  { name: 'Equipe Norte (capitão)', preview: 'Confirmando presença na quadra 1 às 10:30.', time: 'ontem', unread: false },
  { name: 'Marcos Vieira', preview: 'Recebi o estorno, obrigado!', time: 'seg', unread: false },
];

export function initialsOf(fullName: string, sep = ' '): string {
  return fullName
    .split(sep)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Limite padrão de caracteres pra nome de equipe/dupla nas listas e cards. */
export const TEAM_NAME_MAX = 24;

/** Trunca o nome da equipe com reticências (`Amigos do Vôlei de Pra…`).
 *  Corta sem quebrar no meio de espaço sobrando e nunca deixa o texto maior
 *  que `max`. Quem exibe deve pôr o nome completo no `title` pro tooltip. */
export function truncateName(name: string, max = TEAM_NAME_MAX): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/** Rótulo de dupla com cada atleta em no máximo dois nomes:
 *  `"João Pedro Lopes Silva / Ana Carolina Souza"` → `"João Pedro / Ana Carolina"`.
 *
 *  O rótulo nasce em `teamNamesFrom` como `"Atleta1 / Atleta2"`, e nome completo estoura a
 *  coluna do confronto nas listas (o corte por caractere de `truncateName` comia o segundo
 *  atleta inteiro). Nome CUSTOM de equipe (sem `" / "`) passa intacto: cortar "Amigos do Vôlei
 *  de Praia" em "Amigos do" mudaria o nome em vez de encurtá-lo — quem exibe resolve o excesso
 *  com reticências no CSS e o nome cheio no `title`. */
export function compactTeamLabel(label: string, maxNames = 2): string {
  const parts = label.split(' / ');
  if (parts.length < 2) return label.trim();
  return parts
    .map((part) => part.trim().split(/\s+/).slice(0, maxNames).join(' '))
    .filter((part) => part.length > 0)
    .join(' / ');
}
