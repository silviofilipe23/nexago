import {
  registrationCancellable,
  type AthleteTournamentRegistration,
  type RegistrationUniformSlot,
} from '../data/tournament-registrations-repository';
import type { TournamentCategoryOffer, TournamentSummary } from '../data/tournaments-repository';
import { categoryRequiresUniform, isUniformSelectionComplete } from '../tournaments/tournament-uniform';

/** Acompanhamento de inscrição do painel: dado o doc cru da inscrição + torneio + categoria,
 *  devolve a trilha de passos ("Categoria → [Uniforme] → Dupla → Pagamento → Confirmada"), em
 *  qual passo o atleta parou e pra onde o CTA leva.
 *
 *  Módulo puro de propósito (sem Angular, sem Firestore) — é onde a regra mora e o que os
 *  testes exercitam. O componente só renderiza o que sai daqui. */

export type StepState = 'done' | 'current' | 'todo';

export interface ProgressStep {
  label: string;
  caption: string;
  state: StepState;
}

export interface RegistrationProgress {
  registrationId: string;
  tournamentId: string;
  categoryId: string;
  tournamentName: string;
  categoryName: string;
  waitlist: boolean;
  steps: ProgressStep[];
  /** Frase curta do que falta ("Falta o pagamento") — o passo atual em linguagem de gente. */
  pendingLabel: string;
  /** 1-based — é o número que vai no chip `PASSO x/n`. */
  currentStep: number;
  totalSteps: number;
  /** Pronto pra `[routerLink]`. */
  ctaLink: (string | number)[];
  ctaQueryParams: Record<string, string>;
  /** Início do torneio, pra ordenar a lista (mais próximo primeiro). */
  startAtMs: number | null;
  /** Atleta pode cancelar direto (nenhum pagamento na inscrição). */
  canCancel: boolean;
}

export interface RegistrationProgressInput {
  registration: AthleteTournamentRegistration;
  tournament: TournamentSummary;
  category: TournamentCategoryOffer;
  myUid: string;
  myName: string;
  partnerName: string | null;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function firstName(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

const EMPTY_SLOT: RegistrationUniformSlot = {
  sizeTop: null,
  sizeShorts: null,
  jerseyNumber: null,
  jerseyName: null,
};

/** Slot do atleta no doc da inscrição. Três caminhos do backend criam a inscrição de jeitos
 *  diferentes: `registerSoloTournament` grava `player1Id`; aceitar convite anexando ao solo faz
 *  `arrayUnion` (convidado no índice 1); aceitar convite SEM solo prévio grava
 *  `participantUids: [inviter, convidado]` e nenhum `player1Id`. Daí o fallback pelo índice.
 *  Categoria de EQUIPE (trio+) não tem slots fixos: o uniforme mora em `uniformByUid.{uid}`. */
export function uniformSlotForUid(
  registration: Pick<
    AthleteTournamentRegistration,
    'player1Id' | 'participantUids' | 'uniformPlayer1' | 'uniformPlayer2' | 'teamSize' | 'uniformByUid'
  >,
  uid: string,
): RegistrationUniformSlot {
  if (registration.teamSize != null) {
    return registration.uniformByUid[uid] ?? EMPTY_SLOT;
  }
  if (registration.player1Id === uid) return registration.uniformPlayer1;
  if (registration.participantUids[0] === uid) return registration.uniformPlayer1;
  return registration.uniformPlayer2;
}

/** Uniforme do atleta está completo pros requisitos da categoria (mesma regra da tela de
 *  inscrição — reusa `isUniformSelectionComplete` em vez de duplicar o critério). */
export function myUniformIsComplete(
  registration: AthleteTournamentRegistration,
  category: TournamentCategoryOffer,
  uid: string,
): boolean {
  if (!categoryRequiresUniform(category)) return true;
  // `RegistrationUniformSlot` tem exatamente a forma de `UniformSelection`.
  return isUniformSelectionComplete(category, uniformSlotForUid(registration, uid));
}

function partnerCaption(
  registration: AthleteTournamentRegistration,
  myName: string,
  partnerName: string | null,
): string {
  // Equipe nomeada (trio+): a trilha conta o elenco, não "o parceiro".
  if (registration.teamSize != null) {
    if (registration.partnerPending) {
      return `Elenco ${registration.participantUids.length}/${registration.teamSize}`;
    }
    return registration.teamName ?? 'Equipe completa';
  }
  if (registration.partnerPending) return 'Falta parceiro';
  const mine = firstName(myName);
  const theirs = firstName(partnerName);
  if (mine && theirs) return `${mine} & ${theirs}`;
  if (theirs) return theirs;
  return 'Dupla formada';
}

function paymentCaption(
  registration: AthleteTournamentRegistration,
  tournament: TournamentSummary,
  category: TournamentCategoryOffer,
  myUid: string,
): string {
  if (registration.isPaid) return 'Pago';
  if (registration.sharePaidUids.includes(myUid)) return 'Sua parte paga';
  if (tournament.paymentMode === 'directWithOrganizer') return 'Direto com o organizador';
  if (category.entryFee <= 0) return 'Gratuito';
  // Equipe (trio+): a taxa é da equipe e cada atleta paga a própria cota.
  const teamSize = registration.teamSize ?? 2;
  if (teamSize > 2) return `Sua cota · ${formatBRL(category.entryFee / teamSize)}`;
  return `Sua metade · ${formatBRL(category.entryFee / 2)}`;
}

interface StepDraft {
  label: string;
  caption: string;
  done: boolean;
}

/** "Categoria" e "Confirmada" nunca podem ser o passo atual — a inscrição já existe (1) e a
 *  confirmação só fica pendente junto com algum passo anterior (5). */
const PENDING_LABELS: Readonly<Record<string, string>> = {
  Uniforme: 'Falta escolher o uniforme',
  Dupla: 'Falta fechar a dupla',
  Equipe: 'Falta completar a equipe',
  Pagamento: 'Falta o pagamento',
};

/** `null` quando não há passo pendente — inscrição concluída não entra no card. */
export function buildRegistrationProgress(input: RegistrationProgressInput): RegistrationProgress | null {
  const { registration, tournament, category, myUid, myName, partnerName } = input;

  const uniformDone = myUniformIsComplete(registration, category, myUid);
  const partnerDone = !registration.partnerPending;
  const paymentDone = registration.isPaid;

  const drafts: StepDraft[] = [
    { label: 'Categoria', caption: category.categoryName, done: true },
    ...(categoryRequiresUniform(category)
      ? [{ label: 'Uniforme', caption: uniformDone ? 'Salvo' : 'Pendente', done: uniformDone }]
      : []),
    {
      label: registration.teamSize != null ? 'Equipe' : 'Dupla',
      caption: partnerCaption(registration, myName, partnerName),
      done: partnerDone,
    },
    {
      label: 'Pagamento',
      caption: paymentCaption(registration, tournament, category, myUid),
      done: paymentDone,
    },
    { label: 'Confirmada', caption: 'Vaga garantida', done: paymentDone && partnerDone },
  ];

  const currentIndex = drafts.findIndex((step) => !step.done);
  if (currentIndex < 0) return null;

  // Estado visual monotônico: sem isso a trilha pode sair "concluído → pendente → concluído"
  // (ex.: uniforme pendente com pagamento já feito), que lê como bug.
  const steps: ProgressStep[] = drafts.map((step, index) => ({
    label: step.label,
    caption: step.caption,
    state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo',
  }));

  const paymentPending = uniformDone && partnerDone && !paymentDone;
  const ctaLink = paymentPending
    ? ['/torneios', registration.tournamentId, 'inscricao', 'pagamento']
    : ['/torneios', registration.tournamentId, 'inscricao'];
  const ctaQueryParams: Record<string, string> = paymentPending
    ? { registro: registration.id, categoria: registration.categoryId }
    : { categoria: registration.categoryId };

  return {
    registrationId: registration.id,
    tournamentId: registration.tournamentId,
    categoryId: registration.categoryId,
    tournamentName: tournament.name,
    categoryName: category.categoryName,
    waitlist: registration.waitlist,
    steps,
    pendingLabel: PENDING_LABELS[drafts[currentIndex]!.label] ?? 'Inscrição em andamento',
    currentStep: currentIndex + 1,
    totalSteps: drafts.length,
    ctaLink,
    ctaQueryParams,
    startAtMs: tournament.startAt?.getTime() ?? null,
    canCancel: registrationCancellable(registration),
  };
}

/** Torneio/categoria que não resolve é descartado (não renderiza bloco quebrado). Torneio
 *  cancelado também sai: a trilha existe pra empurrar o atleta pro próximo passo, e não há
 *  próximo passo num torneio que não vai acontecer — o CTA levaria a uma inscrição que o
 *  backend recusa. Ordena por início do torneio, crescente; sem data vai pro fim. */
export function buildInProgressRegistrations(
  registrations: readonly AthleteTournamentRegistration[],
  tournaments: ReadonlyMap<string, TournamentSummary>,
  myUid: string,
  myName: string,
  partnerNameByUid: ReadonlyMap<string, string>,
): RegistrationProgress[] {
  return registrations
    .flatMap((registration) => {
      const tournament = tournaments.get(registration.tournamentId);
      const category = tournament?.categories.find((c) => c.id === registration.categoryId);
      if (!tournament || !category || tournament.isCancelled) return [];
      const partnerUid = registration.participantUids.find((uid) => uid !== myUid) ?? null;
      const progress = buildRegistrationProgress({
        registration,
        tournament,
        category,
        myUid,
        myName,
        partnerName: partnerUid ? (partnerNameByUid.get(partnerUid) ?? null) : null,
      });
      return progress ? [progress] : [];
    })
    .sort((a, b) => (a.startAtMs ?? Number.POSITIVE_INFINITY) - (b.startAtMs ?? Number.POSITIVE_INFINITY));
}

/** Uids dos parceiros cujos nomes o card precisa buscar em `public_profiles`. */
export function partnerUidsOf(
  registrations: readonly AthleteTournamentRegistration[],
  myUid: string,
): string[] {
  return [...new Set(registrations.flatMap((r) => r.participantUids).filter((uid) => uid !== myUid))];
}
