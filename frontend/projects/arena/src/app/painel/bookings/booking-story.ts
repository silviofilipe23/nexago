import type { ArenaBooking } from './arena-booking.model';

/**
 * Story da reserva que a ARENA posta (9:16, 1080×1920): a mesma linguagem do story do atleta no
 * app (`BookingStoryCard`, protótipo "Reservar · 5"), com a arena como quem divulga — o jogo
 * marcado na casa. Aqui só dados já formatados; o desenho fica em `booking-story-card.ts`.
 */

/** Fundos da arte. `cover` = a capa da arena (`coverUrl`), só quando ela carrega no canvas;
 *  `photo` = uma imagem que a equipe escolhe no computador/celular (não sobe para lugar nenhum). */
export type BookingStoryTheme = 'ember' | 'night' | 'sand' | 'cover' | 'photo';

/** Fundos com imagem: a imagem preenche a arte e um escurecimento garante a leitura do texto. */
export function bookingStoryThemeHasImage(theme: BookingStoryTheme): boolean {
  return theme === 'cover' || theme === 'photo';
}

export const BOOKING_STORY_THEMES: readonly { id: BookingStoryTheme; label: string }[] = [
  { id: 'cover', label: 'Capa da arena' },
  { id: 'photo', label: 'Sua foto' },
  { id: 'ember', label: 'Brasa' },
  { id: 'night', label: 'Noite' },
  { id: 'sand', label: 'Areia' },
];

/** Arquivo escolhido para o fundo: acima disso nem tenta abrir (mesmo teto do upload de imagens
 *  do portal, `PICKED_IMAGE_MAX_BYTES`). */
export const STORY_PHOTO_MAX_BYTES = 25 * 1024 * 1024;

/** `null` quando o arquivo serve de fundo; senão, a mensagem para a equipe. */
export function bookingStoryPhotoError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!file.type.startsWith('image/')) return 'Escolha um arquivo de imagem (JPG, PNG ou WebP).';
  if (file.size >= STORY_PHOTO_MAX_BYTES) return 'Imagem muito grande. Escolha uma de até 25 MB.';
  return null;
}

/** Momento do jogo: muda o selo e o título ("Bora jogar." antes, "Teve jogo." depois). */
export type BookingStoryMoment = 'upcoming' | 'live' | 'done';

export interface BookingStoryPerson {
  firstName: string;
  initials: string;
  photoUrl: string | null;
}

export interface BookingStory {
  moment: BookingStoryMoment;
  arenaName: string;
  /** Vazio quando a quadra ainda é provisória: a arte não promete uma quadra que pode mudar. */
  courtName: string;
  /** `BEACH TENNIS`; `null` quando a reserva não tem esporte gravado. */
  sportLabel: string | null;
  /** `09:00–10:30` */
  timeRange: string;
  /** `SEX · 22 MAI` */
  dateLabel: string;
  /** Responsável primeiro, depois quem entrou. Só o primeiro nome: o story é público. */
  crew: BookingStoryPerson[];
}

/** O que a arena liga/desliga na arte. */
export interface BookingStoryOptions {
  theme: BookingStoryTheme;
  showCrew: boolean;
  showSport: boolean;
}

/** Mesma regra do app: cancelada ou esperando o pagamento online não vira story. */
export function bookingStoryShareable(status: string): boolean {
  const notYet = new Set(['canceled', 'cancelled', 'pending', 'processing', 'pending_payment']);
  return !notYet.has(status.trim().toLowerCase());
}

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** `2026-05-22` → `SEX · 22 MAI`. Data local, do `dateKey` (nunca de um instante UTC). */
export function bookingStoryDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} · ${d} ${MONTHS[m - 1]}`;
}

/** `09:00` + `10:30` → `09:00–10:30`. */
export function bookingStoryTimeRange(start: string, end: string): string {
  const hm = (v: string) => v.trim().slice(0, 5);
  const s = hm(start);
  const e = hm(end);
  if (!s) return e;
  if (!e) return s;
  return `${s}–${e}`;
}

/** "Maria Eduarda Lima" → "ME"; "Ana" → "AN". */
export function bookingStoryInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('pt-BR');
  return (parts[0][0] + parts[1][0]).toLocaleUpperCase('pt-BR');
}

/** Pessoas da reserva, na ordem da tela. `key` evita repetir alguém; nome vazio fica de fora. */
export function bookingStoryCrew(
  people: readonly { key: string; name: string; photoUrl: string | null }[],
): BookingStoryPerson[] {
  const seen = new Set<string>();
  const crew: BookingStoryPerson[] = [];
  for (const p of people) {
    const name = p.name.trim();
    if (!name || seen.has(p.key)) continue;
    seen.add(p.key);
    crew.push({
      firstName: name.split(/\s+/)[0],
      initials: bookingStoryInitials(name),
      photoUrl: p.photoUrl?.trim() || null,
    });
  }
  return crew;
}

/** `Ana` · `Ana e Enzo` · `Ana, Enzo e Lia` · `Ana, Enzo, Rafa e Lia` · `Ana, Enzo, Rafa e +2`. */
export function bookingStoryCrewNames(crew: readonly BookingStoryPerson[]): string {
  const names = crew.map((p) => p.firstName);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length <= 4) return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  return `${names.slice(0, 3).join(', ')} e +${names.length - 3}`;
}

/** Linha de baixo da "Galera". */
export function bookingStoryCrewCaption(count: number, moment: BookingStoryMoment): string {
  if (moment === 'done') return count <= 1 ? 'Jogou com a gente' : `${count} jogaram com a gente`;
  return count <= 1 ? 'Quem vem jogar?' : `${count} na quadra`;
}

export function bookingStoryHeadline(moment: BookingStoryMoment): [string, string] {
  switch (moment) {
    case 'live':
      return ['Rolando', 'agora.'];
    case 'done':
      return ['Teve', 'jogo.'];
    default:
      return ['Bora', 'jogar.'];
  }
}

export function bookingStoryPill(moment: BookingStoryMoment): string {
  switch (moment) {
    case 'live':
      return 'AO VIVO NA QUADRA';
    case 'done':
      return 'JOGO FEITO';
    default:
      return 'QUADRA GARANTIDA';
  }
}

/** Momento a partir do `tone` de `bookingLiveState` (cancelada nem chega aqui). */
export function bookingStoryMoment(tone: string): BookingStoryMoment {
  if (tone === 'live') return 'live';
  if (tone === 'done') return 'done';
  return 'upcoming';
}

export function bookingStoryFrom(params: {
  booking: Pick<ArenaBooking, 'courtName' | 'sportLabel' | 'dateKey' | 'startTime' | 'endTime' | 'allocationStatus'>;
  arenaName: string;
  moment: BookingStoryMoment;
  crew: BookingStoryPerson[];
}): BookingStory {
  const { booking: b } = params;
  return {
    moment: params.moment,
    arenaName: params.arenaName.trim(),
    courtName: b.allocationStatus === 'unassigned' ? '' : b.courtName.trim(),
    sportLabel: b.sportLabel?.trim() ? b.sportLabel.trim().toLocaleUpperCase('pt-BR') : null,
    timeRange: bookingStoryTimeRange(b.startTime, b.endTime),
    dateLabel: bookingStoryDateLabel(b.dateKey),
    crew: params.crew,
  };
}

/** `story-reserva-2026-05-22-0900.png` */
export function bookingStoryFileName(booking: Pick<ArenaBooking, 'dateKey' | 'startTime'>): string {
  const time = booking.startTime.replace(/\D/g, '').slice(0, 4);
  return `story-reserva-${booking.dateKey}${time ? `-${time}` : ''}.png`;
}
