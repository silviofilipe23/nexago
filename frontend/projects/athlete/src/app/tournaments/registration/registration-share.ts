/**
 * Dados do card compartilhável de inscrição confirmada — o que vai impresso, e as frases.
 *
 * Módulo puro: sem Angular, sem Firestore, sem canvas. O desenho mora em
 * `registration-share-card.ts`; aqui fica a decisão do QUE mostrar, que é a parte com regra e a
 * que dá para testar sem DOM.
 *
 * Paridade com o app: as frases e os rótulos são portados de
 * `nexago_app/lib/features/tournaments/domain/tournament_registration_share_phrases.dart` e
 * `.../tournament_registration_receipt.dart`. Mudou lá, muda aqui.
 */

export interface RegistrationSharePhrase {
  line1: string;
  line2: string;
}

export interface RegistrationShareAthlete {
  name: string;
  photo: string | null;
}

export interface RegistrationShareData {
  headline: RegistrationSharePhrase;
  /** `VAGA #6/8` na categoria. */
  slotLabel: string;
  tournamentName: string;
  /** `18–20 Mai`. */
  dateLabel: string;
  categoryName: string;
  /** `Arena Beach GYN · Goiânia, GO` — vazio quando o torneio não tem local nem cidade. */
  locationLine: string;
  /** `NEXAGO.APP · MAI 2026`. */
  footerLabel: string;
  /** Ordem significativa: é a ordem em que os avatares saem no leque. */
  athletes: RegistrationShareAthlete[];
  /** Categoria de equipe nomeada (trio+): nome dado pelo capitão. `null` = dupla. */
  teamName: string | null;
}

/** O que decide se o botão de compartilhar aparece. Vale para as DUAS telas que mostram uma
 *  inscrição (o shell `/torneios/:id/inscricao` e a aba `minha-inscricao`) — a regra é a mesma e
 *  não pode divergir entre elas. */
export type ShareableRegistration = Pick<
  { isPaid: boolean; partnerPending: boolean; waitlist: boolean },
  'isPaid' | 'partnerPending' | 'waitlist'
>;

/** Só inscrição paga e com o elenco fechado: o card diz "DUPLA/EQUIPE CONFIRMADA", e nos outros
 *  estados isso seria mentira impressa. Lista de espera não é vaga. */
export function registrationShareable(registration: ShareableRegistration): boolean {
  return registration.isPaid && !registration.partnerPending && !registration.waitlist;
}

/** Frases exibidas no card. As que falam em "dupla" ficam fora das categorias de equipe — ver
 *  `pickRegistrationSharePhrase`. */
export const registrationSharePhrases: readonly RegistrationSharePhrase[] = [
  { line1: 'A areia', line2: 'vai ferver.' },
  { line1: 'Confirmados', line2: 'na batalha.' },
  { line1: 'Agora é', line2: 'só jogo.' },
  { line1: 'Dupla pronta', line2: 'pro ataque.' },
  { line1: 'Na disputa', line2: 'de verdade.' },
  { line1: 'Chegamos', line2: 'pra jogar.' },
  { line1: 'Areia, suor', line2: 'e resenha.' },
  { line1: 'O saque', line2: 'tá pago.' },
  { line1: 'Inscrição feita', line2: 'sem caô.' },
  { line1: 'A pressão', line2: 'é deles.' },
  { line1: 'Vai ter', line2: 'rally longo.' },
  { line1: 'Nos vemos', line2: 'na quadra.' },
  { line1: 'Hoje o', line2: 'show acontece.' },
  { line1: 'Tá confirmada', line2: 'a resenha.' },
  { line1: 'Tudo certo', line2: 'pro torneio.' },
  { line1: 'O beach', line2: 'nos chama.' },
  { line1: 'Entramos', line2: 'pra vencer.' },
  { line1: 'Agora ficou', line2: 'sério.' },
  { line1: 'Que vença', line2: 'a melhor dupla.' },
  { line1: 'Só dupla', line2: 'casca grossa.' },
  { line1: 'Bateu a', line2: 'vontade de jogar.' },
  { line1: 'Partiu fazer', line2: 'história.' },
  { line1: 'A rede', line2: 'que lute.' },
  { line1: 'Confirmado', line2: 'na areia quente.' },
  { line1: 'Tem dupla', line2: 'na área.' },
  { line1: 'Modo torneio', line2: 'ativado.' },
  { line1: 'Chega mais', line2: 'pro game.' },
  { line1: 'Nada tira', line2: 'essa vaga.' },
  { line1: 'Vaga garantida', line2: 'na disputa.' },
  { line1: 'A missão', line2: 'começou.' },
  { line1: 'É dentro', line2: 'da quadra.' },
  { line1: 'Vai começar', line2: 'o espetáculo.' },
  { line1: 'Resenha boa', line2: 'e bloqueio alto.' },
  { line1: 'O ponto', line2: 'vale tudo.' },
  { line1: 'Ativando o', line2: 'modo competição.' },
  { line1: 'A dupla', line2: 'vem forte.' },
  { line1: 'O game', line2: 'já virou.' },
  { line1: 'Mais um', line2: 'desafio confirmado.' },
  { line1: 'Ninguém segura', line2: 'essa dupla.' },
  { line1: 'A tropa', line2: 'da areia chegou.' },
];

const defaultSharePhrase: RegistrationSharePhrase = { line1: 'É nóis', line2: 'na areia.' };

function mentionsDuo(phrase: RegistrationSharePhrase): boolean {
  return `${phrase.line1} ${phrase.line2}`.toLowerCase().includes('dupla');
}

/** Hash estável de string (FNV-1a de 32 bits). O app sorteia com `registrationId.hashCode`; aqui
 *  o algoritmo é outro, então a frase escolhida para a MESMA inscrição pode diferir entre app e
 *  portal. O que importa é ser determinística: reabrir o diálogo não pode trocar a frase debaixo
 *  de quem já viu a prévia. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Sorteia a frase a partir do id da inscrição. Em categoria de equipe as frases que falam em
 *  "dupla" ficam de fora — num quarteto elas simplesmente mentem. */
export function pickRegistrationSharePhrase(registrationId: string, options?: { team?: boolean }): RegistrationSharePhrase {
  const pool = options?.team ? registrationSharePhrases.filter((p) => !mentionsDuo(p)) : registrationSharePhrases;
  if (pool.length === 0) return defaultSharePhrase;
  return pool[hashSeed(registrationId) % pool.length] ?? defaultSharePhrase;
}

/** `mai.` / `MAI` conforme o navegador — o ponto e a caixa variam entre engines de ICU. */
function monthAbbrev(date: Date): string {
  const raw = date.toLocaleDateString('pt-BR', { month: 'short' }).replace(/\.$/, '');
  return raw.length === 0 ? raw : `${raw[0]!.toUpperCase()}${raw.slice(1).toLowerCase()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** `18–20 Mai` (mesmo mês), `28 Mai – 2 Jun` (meses diferentes), `18 Mai` (dia único). Sem datas
 *  utilizáveis, cai no rótulo já formatado do torneio. */
export function registrationShareDateLabel(startAt: Date | null, endAt: Date | null, fallbackLabel: string | null): string {
  if (startAt == null) return fallbackLabel?.trim() ?? '';

  const startMonth = monthAbbrev(startAt);
  if (endAt != null && !sameDay(startAt, endAt)) {
    if (startAt.getMonth() === endAt.getMonth() && startAt.getFullYear() === endAt.getFullYear()) {
      return `${startAt.getDate()}–${endAt.getDate()} ${startMonth}`;
    }
    return `${startAt.getDate()} ${startMonth} – ${endAt.getDate()} ${monthAbbrev(endAt)}`;
  }

  const label = fallbackLabel?.trim() ?? '';
  if (label.length > 0) return label;
  return `${startAt.getDate()} ${startMonth}`;
}

/** `Arena Beach GYN · Goiânia, GO`. */
export function registrationShareLocationLine(location: string | null, city: string | null): string {
  const parts = [location?.trim(), city?.trim()].filter((p): p is string => (p ?? '').length > 0);
  return parts.join(' · ');
}

/** `NEXAGO.APP · MAI 2026`. */
export function registrationShareFooter(startAt: Date | null): string {
  if (startAt == null) return 'NEXAGO.APP';
  const month = startAt.toLocaleDateString('pt-BR', { month: 'short' }).replace(/\.$/, '').toUpperCase();
  return `NEXAGO.APP · ${month} ${startAt.getFullYear()}`;
}

/** `VAGA #6/8`. Sem capacidade declarada a categoria é ilimitada — sai só o número da vaga. */
export function registrationShareSlotLabel(enrolled: number | null, maxTeams: number): string {
  if (enrolled == null || enrolled <= 0) return 'VAGA —';
  if (maxTeams <= 0) return `VAGA #${enrolled}`;
  return `VAGA #${enrolled}/${maxTeams}`;
}

/** `Silvio Dionizio · Marcelo Antunes`. */
export function registrationShareAthleteLine(names: readonly string[]): string {
  const filled = names.map((n) => n.trim()).filter((n) => n.length > 0);
  return filled.length > 0 ? filled.join(' · ') : '—';
}

/** `Maria Fernanda Albuquerque` → `Maria A.`. Preserva o primeiro nome inteiro (é como a pessoa
 *  se reconhece) e reduz o resto à inicial. Usado quando o elenco inteiro não cabe na linha —
 *  cinco nomes completos não cabem em card nenhum. */
export function shortAthleteName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'Atleta';
  const [first, ...rest] = parts;
  const last = rest.at(-1);
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first!;
}

/** Legenda que acompanha a imagem na folha nativa. Curta de propósito: no WhatsApp o texto longo
 *  come o espaço do preview. */
export function registrationShareText(data: RegistrationShareData): string {
  const who = data.teamName?.trim() ? `A ${data.teamName.trim()} está confirmada` : 'Estamos confirmados';
  const where = data.tournamentName.trim() ? ` no ${data.tournamentName.trim()}` : '';
  return `${who}${where} — ${data.categoryName}. Nos vemos na quadra! 🏐`;
}

export function registrationShareFileName(tournamentName: string): string {
  const slug = tournamentName
    .toLowerCase()
    .normalize('NFD')
    // Remove os diacríticos decompostos pelo NFD (bloco combining diacritical marks). Escrito com
    // escapes: o range literal são caracteres combinantes e gruda no caractere anterior do fonte.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `nexago-inscricao-${slug || 'torneio'}.png`;
}
