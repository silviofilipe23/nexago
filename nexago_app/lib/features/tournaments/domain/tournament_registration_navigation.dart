import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/ui/app_snackbar.dart';
import 'tournament_discovery_models.dart';
import 'my_tournaments_logic.dart';
import 'tournament_partner_invite.dart';
import 'tournament_registration_logic.dart';
import 'tournament_registration_providers.dart';
import 'tournament_registration_success_args.dart';

/// Navega para a tela de confirmação (compartilhamento social).
void navigateToTournamentRegistrationSuccess(
  BuildContext context, {
  required WidgetRef ref,
  required String tournamentId,
  required String registrationId,
  required String tournamentName,
  required String categoryName,
}) {
  ref
      .read(tournamentRegistrationSuccessHandledIdsProvider.notifier)
      .markHandled(registrationId);

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

/// Destino ao tocar uma inscrição em Meus torneios / Home.
void navigateFromMyTournamentRegistration(
  BuildContext context,
  MyTournamentRegistration registration,
) {
  final tournamentId = registration.tournamentId.trim();
  if (tournamentId.isEmpty) return;

  if (myTournamentRegistrationAwaitingOrganizer(registration)) {
    context.pushNamed(
      AppRouteNames.tournamentDetail,
      pathParameters: {'tournamentId': tournamentId},
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (context.mounted) {
        showAppSnackBar(
          context,
          'Aguardando confirmação do organizador',
        );
      }
    });
    return;
  }

  if (myTournamentRegistrationNeedsPayment(registration)) {
    context.pushNamed(
      AppRouteNames.tournamentRegistration,
      pathParameters: {'tournamentId': tournamentId},
      queryParameters: tournamentRegistrationQueryParams(
        categoryId: registration.categoryId,
        registrationId: registration.registrationId,
        step: TournamentRegistrationStep.payment,
      ),
    );
    return;
  }

  context.pushNamed(
    AppRouteNames.tournamentDetail,
    pathParameters: {'tournamentId': tournamentId},
  );
}
