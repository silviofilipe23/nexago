import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../athlete/domain/athlete_shell_providers.dart';
import '../../domain/tournament_partner_invite.dart';
import '../../domain/tournament_partner_invite_providers.dart';
import '../../domain/tournament_registration_navigation.dart';
import '../../domain/tournament_registration_providers.dart';

/// Escuta convites enviados e direciona o convidador ao pagamento quando aceitos.
class TournamentInviteAcceptCoordinator extends ConsumerStatefulWidget {
  const TournamentInviteAcceptCoordinator({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<TournamentInviteAcceptCoordinator> createState() =>
      _TournamentInviteAcceptCoordinatorState();
}

class _TournamentInviteAcceptCoordinatorState
    extends ConsumerState<TournamentInviteAcceptCoordinator> {
  final Map<String, String> _statusByInviteId = <String, String>{};
  final Set<String> _handledAcceptIds = <String>{};
  bool _seeded = false;

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<List<TournamentPartnerInvite>>>(
      inviterTournamentPartnerInvitesProvider,
      (previous, next) {
        final invites = next.valueOrNull;
        if (invites == null) return;
        _onInvitesUpdated(invites);
      },
    );

    return widget.child;
  }

  void _onInvitesUpdated(List<TournamentPartnerInvite> invites) {
    if (!_seeded) {
      for (final invite in invites) {
        _statusByInviteId[invite.id] = invite.status;
      }
      _seeded = true;
      return;
    }

    for (final invite in invites) {
      final prior = _statusByInviteId[invite.id];
      _statusByInviteId[invite.id] = invite.status;
      if (prior == 'pending' && invite.isAccepted) {
        _handleInviteAccepted(invite);
      }
    }
  }

  Future<void> _handleInviteAccepted(TournamentPartnerInvite invite) async {
    if (_handledAcceptIds.contains(invite.id)) return;
    final regId = invite.registrationId?.trim() ?? '';
    if (regId.isEmpty) return;

    final snap = await ref
        .read(tournamentRegistrationSnapshotProvider(regId).future);
    if (!mounted) return;
    if (snap?.isPaid == true) {
      _handledAcceptIds.add(invite.id);
      return;
    }

    _handledAcceptIds.add(invite.id);
    final firstName = invite.inviteeName.split(' ').first;
    final tab = ref.read(athleteShellTabIndexProvider);
    final onHomeOrCompete =
        tab == 0 || tab == athleteShellCompeteTabIndex;

    if (onHomeOrCompete) {
      context.pushNamed(
        AppRouteNames.tournamentRegistration,
        pathParameters: {'tournamentId': invite.tournamentId},
        queryParameters: tournamentRegistrationPaymentParams(invite),
      );
      return;
    }

    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;

    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          '$firstName aceitou! Conclua o pagamento da inscrição.',
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        backgroundColor: AppColors.black.withValues(alpha: 0.92),
        duration: const Duration(seconds: 8),
        action: SnackBarAction(
          label: 'Pagar',
          textColor: AppColors.brand,
          onPressed: () {
            if (!context.mounted) return;
            context.pushNamed(
              AppRouteNames.tournamentRegistration,
              pathParameters: {'tournamentId': invite.tournamentId},
              queryParameters: tournamentRegistrationPaymentParams(invite),
            );
          },
        ),
      ),
    );
  }
}
