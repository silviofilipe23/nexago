import type { PillTone } from '../data/mock-data';

/** Status da linha no vocabulário real do schema (`isPaid`/`waitlist`) — "estorno" não existe
 *  no backend, então a aba do protótipo foi trocada por "espera" (fila real).
 *
 *  `conferir` é a dupla que declarou ter pago o Pix direto do organizador: a vaga já vale
 *  (`isPaid`), mas nenhum webhook viu o dinheiro. Sem esse estado a linha aparecia como "Pago" e
 *  o botão de confirmar sumia justamente em quem precisava de conferência. */
export type PayStatus = 'pago' | 'conferir' | 'pendente' | 'espera';

/** "cancelamento" não é status de pagamento: é o recorte de quem pediu cancelamento. */
export type InscricaoTab = 'todos' | PayStatus | 'cancelamento';

export const PAY_TONE: Record<PayStatus, PillTone> = {
  pago: 'green',
  conferir: 'orange',
  pendente: 'yellow',
  espera: 'dim',
};

export const PAY_LABEL: Record<PayStatus, string> = {
  pago: 'Pago',
  conferir: 'A conferir',
  pendente: 'Pendente',
  espera: 'Espera',
};

/** Rótulos das abas. O valor cru (`pago`) é o filtro; o rótulo é o que o organizador lê. */
export const INSCRICAO_TABS: readonly { id: InscricaoTab; label: string }[] = [
  { id: 'todos', label: 'Todas' },
  { id: 'pago', label: 'Pagas' },
  { id: 'conferir', label: 'A conferir' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'espera', label: 'Espera' },
  { id: 'cancelamento', label: 'Cancelamento' },
];

/** Aceite do termo de uso de imagem/LGPD registrado na inscrição: `aceito` = todos os atletas,
 *  `parcial` = só parte da dupla, `pendente` = ninguém (inclui inscrições antigas, feitas antes
 *  do termo existir no fluxo).
 *
 *  A lista mostra LGPD por exceção (só quando falta aceite) — o estado completo, atleta por
 *  atleta, fica na gaveta de detalhes. Uma coluna com "Aceito" em toda linha era só ruído. */
export type LgpdStatus = 'aceito' | 'parcial' | 'pendente';

export const LGPD_LABEL: Record<LgpdStatus, string> = {
  aceito: 'Aceito',
  parcial: 'Parcial',
  pendente: 'Pendente',
};

export interface InscricaoAthlete {
  /** `''` em inscrição sem elenco resolvido (fallback do nome da dupla) — nesse caso não dá
   *  pra mirar ação de pagamento neste atleta. */
  uid: string;
  name: string;
  photoUrl: string | null;
  /** Aceitou o termo de uso de imagem/LGPD nesta inscrição. */
  lgpdAccepted: boolean;
  /** Telefone cadastrado, cru (`getTournamentAthleteContacts`); `''` = sem telefone no perfil,
   *  ou contato indisponível. Só a gaveta mostra — é PII, não vai pra varredura da lista. */
  phone: string;
  /** Já quitou a própria parte (`sharePaidUids`) — em pagamento pelo app é dinheiro recebido;
   *  no modo direto é declaração do atleta OU baixa manual deste atleta pelo organizador. */
  sharePaid: boolean;
  /** O organizador confirmou a parte deste atleta manualmente (`organizerConfirmedShareUids`) —
   *  só essa confirmação pode ser desfeita por atleta; a declaração do próprio atleta, não. */
  organizerConfirmedShare: boolean;
}

export interface InscricaoRow {
  id: string;
  name: string;
  athletes: InscricaoAthlete[];
  categoriaId: string | null;
  categoria: string;
  pay: PayStatus;
  /** Explicação do estado de pagamento, sob a pílula ("1 de 2 pagaram", "declarado pelos atletas"). */
  payNote: string | null;
  /** Tooltip da pílula de pagamento — em `conferir`, explica que é declaração do atleta. */
  payTitle: string;
  /** A baixa foi lançada pelo organizador, então ele pode desfazê-la. Pagamento recebido
   *  pela plataforma não tem botão: o dinheiro está numa conta e sai por estorno. */
  canRevertPayment: boolean;
  /** Só parte do elenco confirmou (>0 e <total) — o botão "confirmar a inscrição inteira"
   *  some nesse estado, porque confirmar em bloco marcaria como pago quem não pagou. Só a
   *  confirmação por atleta, na gaveta, fecha o que falta. */
  partialPayment: boolean;
  /** Categoria de equipe (trio+) com elenco incompleto: "Elenco 2/4". `null` fora disso. */
  roster: string | null;
  /** Pedido de cancelamento aberto pelo atleta — motivo escrito por ele. */
  cancelPending: boolean;
  cancelReason: string;
  lgpd: LgpdStatus;
  /** Nomes de quem ainda não aceitou o termo — usado no aviso da linha. */
  lgpdMissing: string[];
  date: string;
  /** Data por extenso para a gaveta ("12 de agosto de 2026"). */
  dateLong: string;
  createdAt: Date | null;
  /** Texto normalizado (sem acento, minúsculo) que a busca varre: dupla + atletas + categoria. */
  search: string;
}

export type InscricaoActionKind =
  | 'confirm'
  | 'revert-payment'
  | 'resend'
  | 'waitlist'
  | 'remove'
  | 'cancel-approve'
  | 'cancel-decline';

export interface InscricaoAction {
  kind: InscricaoActionKind;
  row: InscricaoRow;
  /** Resposta opcional ao atleta, só nas ações de cancelamento. */
  note?: string;
  /** Presente em `confirm`/`revert-payment` disparados de UM atleta da dupla/equipe (gaveta de
   *  detalhes); ausente = ação na inscrição inteira, como sempre foi. */
  athleteUid?: string;
}

/** Nome de atleta brasileiro é cheio de acento; buscar "goncalves" tem que achar "Gonçalves". */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
