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

/** Telefones por uid. O contato é acessório da tela de inscrições: se o callable falhar (sem
 *  permissão, function não deployada, rede), a lista continua funcionando — só sem o botão de
 *  contato. Por isso o erro vira mapa vazio em vez de derrubar o carregamento inteiro. */
export async function fetchAthletePhones(tournamentId: string): Promise<Map<string, string>> {
  const tid = tournamentId.trim();
  const phones = new Map<string, string>();
  if (!tid) return phones;

  try {
    const result = await httpsCallable<{ tournamentId: string }, ContactsResponse>(
      organizerFunctions(),
      'getTournamentAthleteContacts',
    )({ tournamentId: tid });

    for (const [uid, contact] of Object.entries(result.data?.contacts ?? {})) {
      const phone = typeof contact?.phoneNumber === 'string' ? contact.phoneNumber.trim() : '';
      if (phone) phones.set(uid, phone);
    }
  } catch {
    return new Map();
  }
  return phones;
}
