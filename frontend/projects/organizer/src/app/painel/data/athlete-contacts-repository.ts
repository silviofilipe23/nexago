import { httpsCallable } from 'firebase/functions';
import { organizerFunctions } from './functions';

/** Contato (telefone/e-mail) dos atletas INSCRITOS num torneio, via callable
 *  `getTournamentAthleteContacts` — mesmo canal que o app usa
 *  (`organizer_contacts_service.dart`).
 *
 *  Não dá pra ler isso do Firestore: `users/{uid}` é fechado ao dono e o espelho
 *  `public_profiles` é sem PII de propósito. O callable é o único caminho, e é ele que aplica a
 *  ACL (`assertCanManageTournament`) — o organizador só vê contato de quem está inscrito no
 *  torneio dele. */

export interface AthleteContact {
  uid: string;
  fullName: string;
  nickname: string;
  phoneNumber: string;
  email: string;
}

interface ContactsResponse {
  contacts?: Record<string, Partial<AthleteContact>>;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Contatos por uid (nome completo, apelido, telefone e e-mail do cadastro). O contato é
 *  acessório da tela de inscrições: se o callable falhar (sem permissão, function não deployada,
 *  rede), a lista continua funcionando — só sem esses dados. Por isso o erro vira mapa vazio em
 *  vez de derrubar o carregamento inteiro. */
export async function fetchAthleteContacts(tournamentId: string): Promise<Map<string, AthleteContact>> {
  const tid = tournamentId.trim();
  const contacts = new Map<string, AthleteContact>();
  if (!tid) return contacts;

  try {
    const result = await httpsCallable<{ tournamentId: string }, ContactsResponse>(
      organizerFunctions(),
      'getTournamentAthleteContacts',
    )({ tournamentId: tid });

    for (const [uid, contact] of Object.entries(result.data?.contacts ?? {})) {
      contacts.set(uid, {
        uid,
        fullName: str(contact?.fullName),
        nickname: str(contact?.nickname),
        phoneNumber: str(contact?.phoneNumber),
        email: str(contact?.email),
      });
    }
  } catch {
    return new Map();
  }
  return contacts;
}
