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

/** Duas contas da mesma categoria que parecem ser a mesma pessoa: mesmo WhatsApp, a não ser que
 *  os dois nascimentos existam e sejam diferentes. A regra é a da trava de inscrição e roda no
 *  servidor (`findTwinRegistrationPairs` nas functions) — aqui chegam só os ids, nunca o número
 *  que liga as duas contas. As duas inscrições se repetem quando o par está no mesmo elenco. */
export interface TwinRegistrationPair {
  categoryId: string;
  registrationIds: [string, string];
  uids: [string, string];
}

export interface AthleteContactsResult {
  contacts: Map<string, AthleteContact>;
  /** `null` = o callable falhou: a tela mantém o aviso que já tinha em vez de apagá-lo. */
  twinPairs: TwinRegistrationPair[] | null;
}

interface ContactsResponse {
  contacts?: Record<string, Partial<AthleteContact>>;
  twinPairs?: unknown;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function pairOf(v: unknown): [string, string] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [a, b] = [str(v[0]), str(v[1])];
  return a && b ? [a, b] : null;
}

/** Function antiga (sem o campo) devolve lista vazia: sem aviso, como sempre foi. */
function parseTwinPairs(raw: unknown): TwinRegistrationPair[] {
  if (!Array.isArray(raw)) return [];
  const pairs: TwinRegistrationPair[] = [];
  for (const item of raw) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const registrationIds = pairOf(entry['registrationIds']);
    const uids = pairOf(entry['uids']);
    if (!registrationIds || !uids) continue;
    pairs.push({ categoryId: str(entry['categoryId']), registrationIds, uids });
  }
  return pairs;
}

/** Contatos por uid (nome completo, apelido, telefone e e-mail do cadastro) e os pares de
 *  "possível duplicado". O contato é acessório da tela de inscrições: se o callable falhar (sem
 *  permissão, function não deployada, rede), a lista continua funcionando — só sem esses dados.
 *  Por isso o erro vira resultado vazio em vez de derrubar o carregamento inteiro. */
export async function fetchAthleteContacts(tournamentId: string): Promise<AthleteContactsResult> {
  const tid = tournamentId.trim();
  const contacts = new Map<string, AthleteContact>();
  if (!tid) return { contacts, twinPairs: null };

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
    return { contacts, twinPairs: parseTwinPairs(result.data?.twinPairs) };
  } catch {
    return { contacts: new Map(), twinPairs: null };
  }
}
