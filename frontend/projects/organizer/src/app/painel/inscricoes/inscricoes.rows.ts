import { isNamedTeamSize } from '../data/team-size';
import type { AthleteContact, TwinRegistrationPair } from '../data/athlete-contacts-repository';
import type { TournamentInscription } from '../data/inscriptions-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import {
  normalizeSearch,
  type InscricaoAthlete,
  type InscricaoRow,
  type LgpdStatus,
  type PayStatus,
} from './inscricoes.model';

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const LONG_DATE_TIME = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' });

export const TWIN_NOTE = 'Mesmo WhatsApp de outra inscrição nesta categoria';
export const TWIN_NOTE_SAME_TEAM = 'Dois atletas desta inscrição têm o mesmo WhatsApp';

/** Uma ponta do par de "possível duplicado", vista de uma inscrição. */
interface TwinLink {
  uid: string;
  other: TournamentInscription;
  otherUid: string;
}

/** Pares do servidor que ainda valem para a lista ao vivo. O par é a foto do instante da busca
 *  de contatos, e ela só se repete quando entra atleta novo: inscrição removida, atleta
 *  substituído ou dupla trocada de categoria têm de derrubar o aviso na hora, sem esperar. */
function twinLinksByInscription(
  inscriptions: readonly TournamentInscription[],
  pairs: readonly TwinRegistrationPair[],
): Map<string, TwinLink[]> {
  const byId = new Map(inscriptions.map((insc) => [insc.id, insc]));
  const has = (insc: TournamentInscription, uid: string) => insc.participants.some((p) => p.uid === uid);
  const links = new Map<string, TwinLink[]>();
  const add = (insc: TournamentInscription, link: TwinLink) => links.set(insc.id, [...(links.get(insc.id) ?? []), link]);
  for (const pair of pairs) {
    const a = byId.get(pair.registrationIds[0]);
    const b = byId.get(pair.registrationIds[1]);
    const [aUid, bUid] = pair.uids;
    if (!a || !b || a.categoryId !== b.categoryId || !has(a, aUid) || !has(b, bUid)) continue;
    add(a, { uid: aUid, other: b, otherUid: bUid });
    add(b, { uid: bUid, other: a, otherUid: aUid });
  }
  return links;
}

/** Com quem a conta se parece: a outra inscrição pelo nome da dupla; no mesmo elenco, o outro
 *  atleta pelo nome. */
function twinNoteFor(insc: TournamentInscription, links: readonly TwinLink[]): string {
  const elsewhere = [...new Set(links.filter((l) => l.other.id !== insc.id).map((l) => l.other.teamName))];
  if (elsewhere.length > 0) return `${TWIN_NOTE} (${elsewhere.join(', ')})`;
  const names = links.map((l) => insc.participants.find((p) => p.uid === l.otherUid)?.name ?? '').filter(Boolean);
  return names.length > 0 ? `Mesmo WhatsApp de ${names.join(', ')}, desta inscrição` : '';
}

/** Linhas da tela a partir das inscrições cruas — função pura de propósito: com a lista viva,
 *  as entradas (inscrições, torneio, contatos e pares de possível duplicado) chegam em momentos
 *  diferentes, e cada uma que chega remonta as linhas sem tocar na rede. */
export function buildInscricaoRows(
  inscriptions: readonly TournamentInscription[],
  tournament: OrganizerTournament | null,
  contacts: ReadonlyMap<string, AthleteContact>,
  twinPairs: readonly TwinRegistrationPair[] = [],
): InscricaoRow[] {
  const twinLinks = twinLinksByInscription(inscriptions, twinPairs);
  const categoryNames = new Map((tournament?.categories ?? []).map((c) => [c.id, c.name]));
  // No modo direto o atleta DECLARA que pagou; no modo app o dinheiro entrou de verdade.
  // A legenda da linha não pode dizer a mesma coisa nos dois casos.
  const direct = tournament?.paymentMode === 'directWithOrganizer';

  const rows = inscriptions.map<InscricaoRow>((insc) => {
    const twins = twinLinks.get(insc.id) ?? [];
    const accepted = new Set(insc.lgpdAcceptedUids);
    const sharePaid = new Set(insc.sharePaidUids);
    const organizerConfirmedShare = new Set(insc.organizerConfirmedShareUids);
    const athletes: InscricaoAthlete[] =
      insc.participants.length > 0
        ? insc.participants.map((p) => {
            const contact = contacts.get(p.uid);
            const fullName = contact?.fullName || p.name;
            const nickname = contact?.nickname ?? '';
            return {
              uid: p.uid,
              name: p.name,
              fullName,
              // "Ana Paula “Ana Paula”" não ajuda ninguém: perfil sem nome completo cai no
              // apelido, e aí ele já está na tela.
              nickname: normalizeSearch(nickname) === normalizeSearch(fullName) ? '' : nickname,
              email: contact?.email ?? '',
              photoUrl: p.photoUrl,
              lgpdAccepted: accepted.has(p.uid),
              phone: contact?.phoneNumber ?? '',
              sharePaid: sharePaid.has(p.uid),
              organizerConfirmedShare: organizerConfirmedShare.has(p.uid),
              twinNote: twinNoteFor(insc, twins.filter((l) => l.uid === p.uid)),
            };
          })
        : [
            {
              uid: '',
              name: insc.teamName,
              fullName: '',
              nickname: '',
              email: '',
              photoUrl: null,
              lgpdAccepted: false,
              phone: '',
              sharePaid: false,
              organizerConfirmedShare: false,
              twinNote: '',
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
        isNamedTeamSize(insc.teamSize) && insc.partnerPending
          ? `Elenco ${insc.participants.length}/${insc.teamSize}`
          : null,
      twinNote:
        twins.length === 0
          ? null
          : twins.some((l) => l.other.id !== insc.id)
            ? twinNoteFor(insc, twins)
            : TWIN_NOTE_SAME_TEAM,
      cancelPending: insc.cancellationRequest?.status === 'pending',
      cancelReason: insc.cancellationRequest?.reason ?? '',
      lgpd,
      lgpdMissing: missing.map((p) => p.name),
      date: insc.createdAt ? SHORT_DATE.format(insc.createdAt) : '—',
      time: insc.createdAt ? TIME.format(insc.createdAt) : '—',
      dateLong: insc.createdAt ? LONG_DATE_TIME.format(insc.createdAt) : 'Data não registrada',
      createdAt: insc.createdAt,
      search: normalizeSearch(
        [insc.teamName, ...athletes.flatMap((a) => [a.name, a.fullName, a.nickname, a.email]), categoria].join(' '),
      ),
    };
  });

  // A inscrição que acabou de entrar é a que o organizador está esperando ver: topo da lista.
  rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  return rows;
}
