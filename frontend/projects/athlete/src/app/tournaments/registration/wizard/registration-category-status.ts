import {
  registrationOpensLabel,
  registrationClosesLabel,
  type TournamentCategoryOffer,
} from '../../../data/tournaments-repository';
import { evaluateCategoryEligibility } from '../../tournament-eligibility';
import type { MyAthleteProfile } from '../../../data/my-athlete-profile-repository';

/** Estado de uma categoria no passo 1 do wizard.
 *
 *  A ordem das checagens é contrato: já inscrito > prazo encerrado > ainda não abriu >
 *  categoria encerrada > lotada > elegibilidade. Espelha o guard do servidor
 *  (`assertTournamentAcceptsRegistration`): o calendário do TORNEIO vem antes das travas de
 *  categoria, e o PRAZO vem antes da abertura.
 *
 *  "JÁ INSCRITO" é deliberadamente `blocked: false` — a vaga já é do atleta, e bloquear o CTA
 *  foi exatamente o beco sem saída que a inscrição solo pendente sofria: quem reservou sem
 *  parceiro não tinha como voltar ao convite. */
export interface RegistrationCategoryStatus {
  /** Selo curto do card ("JÁ INSCRITO", "LOTADO", "NÍVEL"…). `null` = sem selo. */
  readonly badge: string | null;
  /** Impede criar inscrição nova nesta categoria. */
  readonly blocked: boolean;
  /** Motivo em uma frase, para o CTA e o aviso sob o card. */
  readonly message: string | null;
}

export const REGISTERED_BADGE = 'JÁ INSCRITO';

export interface RegistrationCategoryStatusInput {
  readonly category: TournamentCategoryOffer;
  readonly alreadyRegistered: boolean;
  /** `null` = capacidade desconhecida (categoria sem teto ou contagem não resolvida) — nunca
   *  vira "LOTADO" no escuro. */
  readonly spotsLeft: number | null;
  readonly profile: MyAthleteProfile | null;
  readonly tournamentSport: string | null;
  readonly tournamentStart: Date | null;
  readonly registrationOpensAt: Date | null;
  readonly registrationClosesAt: Date | null;
  readonly now?: Date;
}

export function registrationCategoryStatus(input: RegistrationCategoryStatusInput): RegistrationCategoryStatus {
  const now = input.now ?? new Date();

  if (input.alreadyRegistered) {
    return { badge: REGISTERED_BADGE, blocked: false, message: null };
  }
  // O prazo vem antes da abertura porque é a ordem das checagens da CF. Sem isto o portal
  // exibia "Inscrições até …" e mesmo assim deixava o atleta percorrer três telas para a
  // callable recusar com "Prazo de inscrição encerrado.".
  if (input.registrationClosesAt != null && now.getTime() > input.registrationClosesAt.getTime()) {
    return { badge: 'ENCERRADA', blocked: true, message: 'O prazo de inscrição deste torneio já passou.' };
  }
  // Antes de `registrationOpensAt` a CF recusa qualquer inscrição, então a tela precisa dizer
  // quando abre — não que "encerrou".
  if (input.registrationOpensAt != null && input.registrationOpensAt.getTime() > now.getTime()) {
    return {
      badge: 'EM BREVE',
      blocked: true,
      message: `As inscrições ainda não abriram. Abrem em ${registrationOpensLabel(input.registrationOpensAt)}.`,
    };
  }
  if (input.category.registrationClosed || input.category.isCompleted) {
    return { badge: 'ENCERRADA', blocked: true, message: 'As inscrições desta categoria estão encerradas.' };
  }
  if (input.spotsLeft != null && input.spotsLeft <= 0) {
    return { badge: 'LOTADO', blocked: true, message: 'Esta categoria está lotada.' };
  }
  const eligibility = evaluateCategoryEligibility(input.category, input.profile, {
    tournamentSport: input.tournamentSport,
    tournamentStart: input.tournamentStart,
    now,
  });
  return {
    badge: eligibility.badge,
    blocked: eligibility.status !== 'eligible',
    message: eligibility.message,
  };
}

/** Rótulo do cartão NÍVEL do passo 1.
 *
 *  A escada é de 7 degraus NOMEADOS (não numéricos) — a categoria carrega o texto cru em
 *  `level` (teto) e `minLevel` (piso), sem rank. Com os dois preenchidos e diferentes mostra a
 *  faixa; com só um, esse; sem nenhum, "Livre". */
export function categoryLevelRangeLabel(category: Pick<TournamentCategoryOffer, 'level' | 'minLevel'>): string {
  const min = (category.minLevel ?? '').trim();
  const max = (category.level ?? '').trim();
  if (min.length > 0 && max.length > 0 && min !== max) return `${min} – ${max}`;
  if (max.length > 0) return max;
  if (min.length > 0) return min;
  return 'Livre';
}

export { registrationClosesLabel };
