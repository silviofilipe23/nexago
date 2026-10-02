/**
 * Nome do organizador de um torneio ou liga ("Organizado por X").
 *
 * Carregado sob demanda (`import()` em `PublicTournamentReviewsSource`): o `TournamentLiveStore`
 * mora na carga inicial do portal, que está no limite de 1 MB, e esta leitura não precisa estar lá.
 * Só importa `firebase/firestore`, que já é um chunk inteiro compartilhado — importar daqui
 * qualquer módulo do portal que esteja num chunk inicial partiria esse chunk em dois.
 */
import { doc, getDoc, type Firestore } from 'firebase/firestore';

export interface OrganizerNameLookup {
  readonly name: string;
  /** O nome veio da marca (`organizerPublicProfiles` com `isOrganizer`): existe página pública
   *  em `/organizadores/{id}`. Sem isso, o nome aparece sem link — o link levaria a "não encontrado". */
  readonly hasPublicProfile: boolean;
}

type Data = Record<string, unknown> | undefined;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Nome da marca em `organizerPublicProfiles/{uid}`. O doc pode existir sem identidade (criado só
 *  pelos números ou pelo contador de seguidores): só vale com `isOrganizer`. */
export function organizerBrandNameFromData(data: Data): string | null {
  return data?.['isOrganizer'] === true ? text(data['name']) || null : null;
}

/** Nome da pessoa em `public_profiles/{uid}`: nome completo antes do apelido. */
export function organizerPersonNameFromData(data: Data): string | null {
  if (!data) return null;
  return text(data['fullName']) || text(data['name']) || text(data['nickname']).replace(/^@/, '') || null;
}

const readDoc = (db: Firestore, collection: string, id: string): Promise<Data> =>
  getDoc(doc(db, collection, id)).then(
    (snap) => snap.data(),
    () => undefined,
  );

/** Só a marca (para a liga, que já tem o próprio nome de organização como reserva). */
export async function fetchOrganizerBrandName(db: Firestore, organizerId: string): Promise<string | null> {
  return organizerBrandNameFromData(await readDoc(db, 'organizerPublicProfiles', organizerId));
}

/** A marca e, sem ela, `public_profiles` (conta só de organizador não tem nome lá). Leituras
 *  públicas; falha vira `null`: sem linha. */
export async function lookupOrganizerName(db: Firestore, organizerId: string): Promise<OrganizerNameLookup | null> {
  const brand = await fetchOrganizerBrandName(db, organizerId);
  if (brand) return { name: brand, hasPublicProfile: true };
  const person = organizerPersonNameFromData(await readDoc(db, 'public_profiles', organizerId));
  return person ? { name: person, hasPublicProfile: false } : null;
}
