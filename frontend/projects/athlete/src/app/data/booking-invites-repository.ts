import { collection, getDocs, limit, query, where, type Firestore } from 'firebase/firestore';

/** Convites de reserva aceitos além do par único `guestAthleteId`/`guestAthleteName` gravado
 *  na própria reserva — espelha a leitura de `bookingInvites` em `BookingDetailsTeamProviders`
 *  (Flutter) para completar a lista de convidados confirmados. */
export async function fetchAcceptedBookingInviteGuestUids(
  db: Firestore,
  bookingId: string,
  max = 5,
): Promise<string[]> {
  const snap = await getDocs(
    query(
      collection(db, 'bookingInvites'),
      where('bookingId', '==', bookingId),
      where('status', '==', 'accepted'),
      limit(max),
    ),
  );
  const uids = new Set<string>();
  for (const d of snap.docs) {
    const uid = d.data()['acceptedByUid'];
    if (typeof uid === 'string' && uid.trim()) uids.add(uid.trim());
  }
  return [...uids];
}
