import type { ArenaAmenities } from '@nexago/arena-discovery';

/** Espelha `nexago_app/.../arena/data/arena_profile_edit_service.dart` — schema real e
 *  validação de `arenas/{arenaId}` (campos que o gestor edita diretamente, permitidos
 *  pela firestore.rules). Vendas/PIX de repasse ficam de fora (fluxo próprio em
 *  arena_wallet_repository.dart/arena_payments_page.dart, não é "perfil"). */

/** `arenas.courtTypes` — só esporte, não superfície. Espelha `ArenaSearchMetadata.sportLabels`. */
export const ARENA_SPORT_OPTIONS: readonly string[] = [
  'Vôlei de praia',
  'Beach tennis',
  'Vôlei indoor',
  'Tênis',
  'Padel',
  'Futebol',
  'Futevôlei',
  'Pickleball',
];

/** `arenas.surfaces`. Espelha `ArenaSearchMetadata.surfaceOptions`. */
export const ARENA_SURFACE_OPTIONS: readonly string[] = ['Areia', 'Saibro', 'Sintética', 'Grama', 'Concreto'];

export const ARENA_AMENITY_LABEL: Record<keyof ArenaAmenities, string> = {
  parking: 'Estacionamento',
  lockerRoom: 'Vestiário',
  coveredCourt: 'Quadra coberta',
  bar: 'Bar / lanchonete',
  racketRental: 'Aluguel de raquetes',
};

export const ARENA_AMENITY_KEYS: readonly (keyof ArenaAmenities)[] = [
  'parking',
  'lockerRoom',
  'coveredCourt',
  'bar',
  'racketRental',
];

export interface ArenaProfile {
  name: string;
  description: string;
  phone: string;
  whatsapp: string;
  address: string;
  city: string;
  state: string;
  coverUrl: string;
  logoUrl: string;
  courtTypes: string[];
  surfaces: string[];
  amenities: ArenaAmenities;
  onlinePaymentEnabled: boolean;
  onsitePaymentEnabled: boolean;
  /** Só leitura — agregado por Cloud Function (`arena-review-aggregates.ts`). */
  ratingAverage: number;
  /** Só leitura — agregado por Cloud Function. */
  reviewsCount: number;
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Telefone/WhatsApp BR: só dígitos, 10–13 caracteres. Espelha `isValidArenaPhoneDigits`. */
export function isValidArenaPhoneDigits(raw: string): boolean {
  const digits = digitsOnly(raw);
  return digits.length >= 10 && digits.length <= 13;
}

/** Validação da tela "Perfil" (dados básicos, modalidades, comodidades, pagamento).
 *  Espelha o subconjunto correspondente de `ArenaProfileEditService.saveProfile`. As demais
 *  regras dessa function (telefone/whatsapp/cidade/estado) pertencem a `validateArenaContacts`,
 *  já que essa tela do painel arena divide o que no Flutter é um formulário único em duas
 *  páginas (Perfil e Contatos), cada uma salvando só os campos que edita. */
export function validateArenaBasicInfo(profile: Pick<ArenaProfile, 'name' | 'onlinePaymentEnabled' | 'onsitePaymentEnabled'>): string | null {
  if (!profile.name.trim()) {
    return 'Informe o nome da arena.';
  }
  if (!profile.onlinePaymentEnabled && !profile.onsitePaymentEnabled) {
    return 'Ative pelo menos uma forma de pagamento.';
  }
  return null;
}

/** Validação da tela "Contatos" (telefone, whatsapp, endereço). */
export function validateArenaContacts(contacts: Pick<ArenaProfile, 'phone' | 'whatsapp' | 'city' | 'state'>): string | null {
  const phoneDigits = digitsOnly(contacts.phone);
  if (phoneDigits.length < 10 || phoneDigits.length > 13) {
    return 'Telefone inválido. Use DDD + número (10 a 13 dígitos).';
  }
  const wa = contacts.whatsapp.trim();
  if (wa && !isValidArenaPhoneDigits(wa)) {
    return 'WhatsApp inválido.';
  }
  if (!contacts.city.trim()) {
    return 'Informe a cidade da arena.';
  }
  if (!contacts.state.trim()) {
    return 'Informe o estado da arena.';
  }
  return null;
}
