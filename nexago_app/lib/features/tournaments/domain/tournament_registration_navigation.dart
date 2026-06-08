import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import 'tournament_partner_invite.dart';
import 'tournament_registration_logic.dart';
import 'tournament_registration_success_args.dart';

/// Navega para a tela de confirmação (compartilhamento social).
void navigateToTournamentRegistrationSuccess(
  BuildContext context, {
  required String tournamentId,
  required String registrationId,
  required String tournamentName,
  required String categoryName,
}) {
  context.goNamed(
    AppRouteNames.tournamentRegistrationSuccess,
    pathParameters: {'tournamentId': tournamentId},
    extra: TournamentRegistrationSuccessArgs(
      tournamentId: tournamentId,
      registrationId: registrationId,
      tournamentName: tournamentName,
      categoryName: categoryName,
    ),
    queryParameters: {
      'registrationId': registrationId,
      'tournamentName': tournamentName,
      'categoryName': categoryName,
    },
  );
}

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
