import 'tournament_partner_invite.dart';
import 'tournament_registration_logic.dart';

/// Query params para [AppRouteNames.tournamentRegistration].
Map<String, String> tournamentRegistrationQueryParams({
  String? categoryId,
  String? registrationId,
  String? inviteId,
  TournamentRegistrationStep? step,
}) {
  final params = <String, String>{};
  final cat = categoryId?.trim();
  final reg = registrationId?.trim();
  final inv = inviteId?.trim();
  if (cat != null && cat.isNotEmpty) params['categoryId'] = cat;
  if (reg != null && reg.isNotEmpty) params['registrationId'] = reg;
  if (inv != null && inv.isNotEmpty) params['inviteId'] = inv;
  if (step == TournamentRegistrationStep.payment) {
    params['step'] = 'payment';
  } else if (step == TournamentRegistrationStep.waiting) {
    params['step'] = 'waiting';
  }
  return params;
}

/// Abre inscrição no passo de pagamento após convite aceito.
Map<String, String> tournamentRegistrationPaymentParams(
  TournamentPartnerInvite invite,
) {
  return tournamentRegistrationQueryParams(
    categoryId: invite.categoryId,
    registrationId: invite.registrationId,
    inviteId: invite.id,
    step: TournamentRegistrationStep.payment,
  );
}

/// Abre inscrição aguardando parceiro.
Map<String, String> tournamentRegistrationWaitingParams(
  TournamentPartnerInvite invite,
) {
  return tournamentRegistrationQueryParams(
    categoryId: invite.categoryId,
    inviteId: invite.id,
    step: TournamentRegistrationStep.waiting,
  );
}
