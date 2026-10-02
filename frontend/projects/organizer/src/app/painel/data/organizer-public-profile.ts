/** Perfil público do organizador — os três campos que o card "Perfil público" de `/painel/config`
 *  edita dentro de `users/{uid}.organizerProfile`. A Cloud Function
 *  `onUserWrittenSyncOrganizerPublicProfile` projeta esses campos (mais nome, logo, cidade e o
 *  telefone de contato) em `organizerPublicProfiles/{uid}`, que é o que o atleta lê.
 *  Spec: docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md
 *
 *  Por que um modelo SEPARADO de `OrganizerProfile`: o card "Perfil" grava aquele mapa inteiro
 *  com `setDoc(merge)`. Se os campos daqui morassem nele, a cópia que o card "Perfil" carregou ao
 *  abrir a edição reenviaria bio/capa velhas e apagaria o que o card "Perfil público" acabou de
 *  salvar. Aqui a gravação é por caminho pontilhado e só destes três campos.
 *
 *  Módulo puro: sem Angular e sem I/O (o `deleteField()` só cria a sentinela). */

import { deleteField, type FieldValue } from 'firebase/firestore';

/** Mesmo teto da projeção no servidor (`ORGANIZER_BIO_MAX` em functions). */
export const ORGANIZER_BIO_MAX = 280;
/** Limite do arquivo escolhido, ANTES de redimensionar. */
export const ORGANIZER_COVER_MAX_BYTES = 5 * 1024 * 1024;
export const ORGANIZER_COVER_MAX_WIDTH = 1600;

export interface OrganizerPublicProfileSettings {
  bio: string;
  coverUrl: string | null;
  /** Opt-in do botão de WhatsApp. O número é o `contactPhone` do card "Perfil". */
  publicWhatsapp: boolean;
}

export const DEFAULT_ORGANIZER_PUBLIC_PROFILE: OrganizerPublicProfileSettings = {
  bio: '',
  coverUrl: null,
  publicWhatsapp: false,
};

/** Recebe o mapa `organizerProfile` (não o doc inteiro). Campo ausente ou de tipo errado vira
 *  default; nunca lança. */
export function parseOrganizerPublicProfile(organizerProfile: Record<string, unknown>): OrganizerPublicProfileSettings {
  const bio = organizerProfile['bio'];
  const coverUrl = organizerProfile['coverUrl'];
  return {
    bio: typeof bio === 'string' ? bio.trim() : '',
    coverUrl: typeof coverUrl === 'string' && coverUrl.trim() ? coverUrl.trim() : null,
    publicWhatsapp: organizerProfile['publicWhatsapp'] === true,
  };
}

/** Trim + corte em 280 unidades UTF-16 (a mesma conta do `maxlength` do textarea e do `slice`
 *  do servidor). Se o corte cair no meio de um emoji, a metade solta sai junto. */
export function normalizeOrganizerBio(raw: string): string {
  const cut = raw.trim().slice(0, ORGANIZER_BIO_MAX);
  return cut.replace(/[\uD800-\uDBFF]$/, '').trimEnd();
}

/** DDD + número. Menos que isso o servidor não publica o WhatsApp (o `wa.me` não abre). */
export function hasUsableContactPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').length >= 10;
}

/** Payload do `updateDoc` em `users/{uid}`: as três chaves pontilhadas e NADA mais. */
export type OrganizerPublicProfilePatch = {
  'organizerProfile.bio': string;
  'organizerProfile.coverUrl': string | FieldValue;
  'organizerProfile.publicWhatsapp': boolean;
};

/** Monta o payload campo a campo (não espalha o rascunho), então nenhuma chave extra que o
 *  rascunho traga chega ao Firestore. Capa removida vira `deleteField()`. Sem telefone de
 *  contato o switch aparece desligado, e é isso que se grava. */
export function buildOrganizerPublicProfilePatch(
  draft: OrganizerPublicProfileSettings,
  opts: { hasContactPhone: boolean },
): OrganizerPublicProfilePatch {
  const cover = typeof draft.coverUrl === 'string' ? draft.coverUrl.trim() : '';
  return {
    'organizerProfile.bio': normalizeOrganizerBio(draft.bio ?? ''),
    'organizerProfile.coverUrl': cover ? cover : deleteField(),
    'organizerProfile.publicWhatsapp': draft.publicWhatsapp === true && opts.hasContactPhone,
  };
}

/** `null` = arquivo aceito. Roda antes de redimensionar. */
export function validateCoverFile(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith('image/')) return 'Escolha um arquivo de imagem.';
  if (file.size > ORGANIZER_COVER_MAX_BYTES) return 'Imagem muito grande (máximo 5 MB).';
  return null;
}

/** Rota do perfil no portal do atleta (`environment.athleteAppUrl`). */
export function organizerPublicProfileUrl(athleteBaseUrl: string, uid: string): string {
  return `${athleteBaseUrl.replace(/\/+$/, '')}/organizadores/${encodeURIComponent(uid)}`;
}
