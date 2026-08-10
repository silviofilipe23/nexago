import type { AthleteTournamentRegistration } from '../../data/tournament-registrations-repository';

/** O que a aba "Minha inscrição" mostra sobre o elenco e quem pode convidar.
 *
 *  Módulo puro (padrão de `painel/registration-progress.ts`) — o envio do convite em si
 *  vive no shell de inscrição (`/torneios/:id/inscricao`), que já tem busca, convites
 *  pendentes e gating de LGPD/uniforme; aqui só decidimos o rótulo, o flag e se o CTA
 *  que leva pra lá aparece. */

export type RosterViewRegistration = Pick<
  AthleteTournamentRegistration,
  'teamSize' | 'partnerPending' | 'captainUid' | 'player1Id' | 'participantUids'
>;

export interface RegistrationRosterView {
  /** Rótulo do fato no card: "Equipe" (trio+) ou "Dupla". */
  teamLabel: 'Equipe' | 'Dupla';
  /** "Elenco 2/4" (equipe com vaga aberta) ou "convite pendente" (dupla aguardando). */
  rosterFlag: string | null;
  /** Texto do CTA que leva ao shell de inscrição; `null` = sem CTA. */
  inviteLabel: string | null;
  /** Integrante (não capitão) de equipe incompleta: quem convida é o capitão. */
  captainOnlyHint: string | null;
}

export function registrationRosterView(
  registration: RosterViewRegistration,
  uid: string | null,
): RegistrationRosterView {
  const isTeam = registration.teamSize != null;
  const teamLabel = isTeam ? 'Equipe' : 'Dupla';

  if (!registration.partnerPending) {
    return { teamLabel, rosterFlag: null, inviteLabel: null, captainOnlyHint: null };
  }

  if (!isTeam) {
    // Dupla aguardando parceiro: a inscrição pendente só tem o próprio convidante,
    // então quem vê o card é sempre quem pode convidar.
    return {
      teamLabel,
      rosterFlag: 'convite pendente',
      inviteLabel: 'Convidar parceiro',
      captainOnlyHint: null,
    };
  }

  // Mesmo fallback de capitão do shell e do backend (docs antigos sem `captainUid`).
  const captainUid = registration.captainUid ?? registration.player1Id ?? registration.participantUids[0] ?? null;
  const isCaptain = uid != null && uid === captainUid;
  return {
    teamLabel,
    rosterFlag: `Elenco ${registration.participantUids.length}/${registration.teamSize}`,
    inviteLabel: isCaptain ? 'Convidar atletas' : null,
    captainOnlyHint: isCaptain || uid == null ? null : 'O capitão convida os atletas que faltam.',
  };
}
