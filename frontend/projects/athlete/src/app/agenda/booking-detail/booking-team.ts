import { BOOKING_MAX_PLAYERS, type BookingParticipant } from '../../data/booking-invite-model';

/** Linha da equipe no detalhe da reserva — espelha `BookingDetailsTeamMember` (Flutter). */
export interface BookingTeamMember {
  id: string;
  uid: string | null;
  displayName: string;
  subtitle: string;
  initials: string;
  avatarUrl: string | null;
  isOrganizer: boolean;
  /** É quem está com a tela aberta (a linha mostra "Você"). */
  isViewer: boolean;
  isEmptySlot: boolean;
  showPaidBadge: boolean;
  /** O dono tira só quem entrou pelo convite novo (lista do servidor) — o legado não sai. */
  removable: boolean;
}

/** Convidado de reserva antiga: o par `guestAthleteId`/`guestAthleteName` ou um convite aceito
 *  do app 1.0.1, já com o nome resolvido. */
export interface LegacyBookingGuest {
  uid: string | null;
  name: string;
}

export interface BookingTeamInput {
  ownerUid: string | null;
  viewerUid: string | null;
  /** Nome da conta logada (iniciais do dono quando quem vê é o dono). */
  viewerName: string;
  /** Nome de quem reservou, quando quem vê NÃO é o dono. */
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  ownerPaid: boolean;
  participants: readonly BookingParticipant[];
  legacyGuests: readonly LegacyBookingGuest[];
  /** Quem vê é o dono e o jogo ainda não terminou. */
  canRemove: boolean;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last || first).toUpperCase();
}

/** Sem dono gravado ou sem sessão, a tela segue como antes: quem vê é o dono. */
export function viewerIsBookingOwner(ownerUid: string | null, viewerUid: string | null): boolean {
  return !ownerUid || !viewerUid || ownerUid === viewerUid;
}

/** Dono primeiro, depois quem entrou (servidor) e o legado, completando as 4 vagas. O dono só
 *  aparece como "Você" para ele mesmo — o convidado vê o nome de quem reservou e a si como "Você". */
export function buildBookingTeam(input: BookingTeamInput): BookingTeamMember[] {
  const isOwner = viewerIsBookingOwner(input.ownerUid, input.viewerUid);
  const ownerName = isOwner ? input.viewerName : input.ownerName?.trim() || 'Quem reservou';
  const members: BookingTeamMember[] = [
    {
      id: 'organizer',
      uid: input.ownerUid,
      displayName: isOwner ? 'Você' : ownerName,
      subtitle: 'organizador',
      initials: initialsOf(ownerName),
      avatarUrl: isOwner ? null : input.ownerAvatarUrl,
      isOrganizer: true,
      isViewer: isOwner,
      isEmptySlot: false,
      showPaidBadge: input.ownerPaid,
      removable: false,
    },
  ];

  const seen = new Set<string>(input.ownerUid ? [input.ownerUid] : []);
  const addGuest = (uid: string | null, name: string, avatarUrl: string | null, removable: boolean) => {
    if (uid) {
      if (seen.has(uid)) return;
      seen.add(uid);
    }
    const isViewer = uid != null && uid === input.viewerUid;
    members.push({
      id: uid ?? `guest-${members.length}`,
      uid,
      displayName: isViewer ? 'Você' : name,
      subtitle: 'Confirmado',
      initials: initialsOf(name),
      avatarUrl,
      isOrganizer: false,
      isViewer,
      isEmptySlot: false,
      showPaidBadge: false,
      removable: removable && !isViewer,
    });
  };
  for (const p of input.participants) addGuest(p.uid, p.name, p.avatarUrl, input.canRemove);
  for (const g of input.legacyGuests) addGuest(g.uid, g.name, null, false);

  for (let i = members.length; i < BOOKING_MAX_PLAYERS; i++) {
    members.push({
      id: `empty-${i}`,
      uid: null,
      displayName: 'Vaga aberta',
      subtitle: isOwner ? 'Convide alguém da sua rede' : 'Aguardando jogadores',
      initials: '+',
      avatarUrl: null,
      isOrganizer: false,
      isViewer: false,
      isEmptySlot: true,
      showPaidBadge: false,
      removable: false,
    });
  }
  return members;
}
