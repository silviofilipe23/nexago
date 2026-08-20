import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import 'tournament_discovery_models.dart';
import 'my_tournaments_logic.dart';
import 'registration_progress_logic.dart';
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
  } else if (step == TournamentRegistrationStep.partner) {
    params['step'] = 'partner';
  }
  return params;
}

/// Retomada de uma inscrição que JÁ EXISTE.
///
/// Carrega sempre o `registrationId`: sem ele a tela abre no passo de
/// categoria, e lá a categoria já inscrita não abre a inscrição existente — o
/// atleta que reservou solo ficava sem caminho até o convite do parceiro.
///
/// O destino é o passo de pagamento porque ele é o painel da inscrição: é onde
/// moram o convite do parceiro (`showSoloPartnerInvite`), o uniforme, o
/// pagamento e o cancelamento. `registrationId` vazio = nada a retomar, e o
/// destino volta a ser o fluxo normal de inscrição.
Map<String, String> tournamentRegistrationResumeParams({
  required String categoryId,
  required String registrationId,
}) {
  final reg = registrationId.trim();
  if (reg.isEmpty) {
    return tournamentRegistrationQueryParams(categoryId: categoryId);
  }
  return tournamentRegistrationQueryParams(
    categoryId: categoryId,
    registrationId: reg,
    step: TournamentRegistrationStep.payment,
  );
}

/// Destino do CTA "Continuar" da trilha de passos (Home do atleta e aba
/// "Minha inscrição"). Vale para qualquer passo pendente — parceiro, uniforme
/// ou pagamento —, porque todos são resolvidos a partir da inscrição existente.
Map<String, String> registrationProgressResumeParams(
  RegistrationProgress item,
) {
  return tournamentRegistrationResumeParams(
    categoryId: item.categoryId,
    registrationId: item.registrationId,
  );
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

  // Pago sem parceiro (solo pagou o total): abre direto no passo de convite.
  if (myTournamentRegistrationPaidAwaitingPartner(registration)) {
    context.pushNamed(
      AppRouteNames.tournamentRegistration,
      pathParameters: {'tournamentId': tournamentId},
      queryParameters: tournamentRegistrationQueryParams(
        categoryId: registration.categoryId,
        registrationId: registration.registrationId,
        step: TournamentRegistrationStep.partner,
      ),
    );
    return;
  }

  if (myTournamentRegistrationAwaitingOrganizer(registration)) {
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
