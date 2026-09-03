import type { TournamentInscription } from '../data/inscriptions-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { normalizeSearch, type InscricaoRow, type LgpdStatus, type PayStatus } from './inscricoes.model';

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const LONG_DATE_TIME = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' });

/** Linhas da tela a partir das inscrições cruas — função pura de propósito: com a lista viva,
 *  as três entradas (inscrições, torneio, telefones) chegam em momentos diferentes, e cada uma
 *  que chega remonta as linhas sem tocar na rede. */
export function buildInscricaoRows(
  inscriptions: readonly TournamentInscription[],
  tournament: OrganizerTournament | null,
  phones: ReadonlyMap<string, string>,
): InscricaoRow[] {
  const categoryNames = new Map((tournament?.categories ?? []).map((c) => [c.id, c.name]));
  // No modo direto o atleta DECLARA que pagou; no modo app o dinheiro entrou de verdade.
  // A legenda da linha não pode dizer a mesma coisa nos dois casos.
  const direct = tournament?.paymentMode === 'directWithOrganizer';

  const rows = inscriptions.map<InscricaoRow>((insc) => {
    const accepted = new Set(insc.lgpdAcceptedUids);
    const sharePaid = new Set(insc.sharePaidUids);
    const organizerConfirmedShare = new Set(insc.organizerConfirmedShareUids);
    const athletes =
      insc.participants.length > 0
        ? insc.participants.map((p) => ({
            uid: p.uid,
            name: p.name,
            photoUrl: p.photoUrl,
            lgpdAccepted: accepted.has(p.uid),
            phone: phones.get(p.uid) ?? '',
            sharePaid: sharePaid.has(p.uid),
            organizerConfirmedShare: organizerConfirmedShare.has(p.uid),
          }))
        : [
            {
              uid: '',
              name: insc.teamName,
              photoUrl: null,
              lgpdAccepted: false,
              phone: '',
              sharePaid: false,
              organizerConfirmedShare: false,
            },
          ];
    const missing = insc.participants.filter((p) => !accepted.has(p.uid));
    const lgpd: LgpdStatus =
      insc.participants.length > 0 && missing.length === 0
        ? 'aceito'
        : missing.length < insc.participants.length
          ? 'parcial'
          : 'pendente';
    const pay: PayStatus = insc.needsVerification
      ? 'conferir'
      : insc.paid
        ? 'pago'
        : insc.paymentStatus === 'waitlist'
          ? 'espera'
          : 'pendente';
    // Em categoria de equipe a conta é sobre o elenco COMPLETO (teamSize), não sobre quem
    // já entrou — "1 de 4 pagaram" com 2 confirmados no elenco conta a história certa.
    const total = insc.teamSize ?? insc.participants.length;
    const partial = pay !== 'conferir' && total > 1 && insc.sharePaidCount > 0 && insc.sharePaidCount < total;
    const categoria = (insc.categoryId && categoryNames.get(insc.categoryId)) || '—';
    return {
      id: insc.id,
      name: insc.teamName,
      athletes: athletes.slice(0, 5),
      categoriaId: insc.categoryId,
      categoria,
      pay,
      // Só a baixa que o organizador lançou é reversível — e só faz sentido oferecer
      // desfazer o que está valendo como "Pago" agora.
      canRevertPayment: pay === 'pago' && insc.paidByOrganizer,
      partialPayment: partial,
      payTitle:
        pay === 'conferir'
          ? 'Os atletas declararam ter pago o Pix do organizador. Confira o recebimento e confirme.'
          : '',
      payNote: partial
        ? `${insc.sharePaidCount} de ${total} ${direct ? 'declararam' : 'pagaram'}`
        : pay === 'conferir'
          ? 'Declarado pelos atletas'
          : null,
      roster:
        insc.teamSize != null && insc.partnerPending
          ? `Elenco ${insc.participants.length}/${insc.teamSize}`
          : null,
      cancelPending: insc.cancellationRequest?.status === 'pending',
      cancelReason: insc.cancellationRequest?.reason ?? '',
      lgpd,
      lgpdMissing: missing.map((p) => p.name),
      date: insc.createdAt ? SHORT_DATE.format(insc.createdAt) : '—',
      time: insc.createdAt ? TIME.format(insc.createdAt) : '—',
      dateLong: insc.createdAt ? LONG_DATE_TIME.format(insc.createdAt) : 'Data não registrada',
      createdAt: insc.createdAt,
      search: normalizeSearch([insc.teamName, ...insc.participants.map((p) => p.name), categoria].join(' ')),
    };
  });

  // A inscrição que acabou de entrar é a que o organizador está esperando ver: topo da lista.
  rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  return rows;
}
