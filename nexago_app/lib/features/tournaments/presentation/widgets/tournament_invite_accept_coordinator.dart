import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../athlete/domain/tournament_access_providers.dart';
import '../../domain/tournament_detail_model.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_partner_invite.dart';
import '../../domain/tournament_partner_invite_providers.dart';
import '../../domain/tournament_registration_navigation.dart';
import '../../domain/tournament_registration_providers.dart';

/// Escuta convites e inscrições pagas; direciona ambos os atletas à confirmação.
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
  final Set<String> _handledPaidRegistrationIds = <String>{};
  bool _inviterSeeded = false;

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<List<TournamentPartnerInvite>>>(
      inviterTournamentPartnerInvitesProvider,
      (previous, next) {
        final invites = next.valueOrNull;
        if (invites == null) return;
        _onInviterInvitesUpdated(invites);
      },
    );

    ref.listen<AsyncValue<List<TournamentPartnerInvite>>>(
      inviteeAcceptedTournamentPartnerInvitesProvider,
      (previous, next) {
        final invites = next.valueOrNull;
        if (invites == null) return;
        unawaited(_markAlreadyPaidRegistrations(invites));
      },
    );

    for (final invite in _acceptedRegistrationInvites()) {
      final regId = invite.registrationId?.trim() ?? '';
      if (regId.isEmpty || _handledPaidRegistrationIds.contains(regId)) {
        continue;
      }

      ref.listen(tournamentRegistrationSnapshotProvider(regId), (
        previous,
        next,
      ) {
        final wasPaid = previous?.valueOrNull?.isPaid == true;
        final isPaid = next.valueOrNull?.isPaid == true;
        if (!isPaid || wasPaid) return;
        unawaited(_navigateToRegistrationSuccess(invite));
      });
    }

    return widget.child;
  }

  List<TournamentPartnerInvite> _acceptedRegistrationInvites() {
    final inviter =
        ref.watch(inviterTournamentPartnerInvitesProvider).valueOrNull ?? [];
    final invitee =
        ref.watch(inviteeAcceptedTournamentPartnerInvitesProvider).valueOrNull ??
        [];
    final byRegId = <String, TournamentPartnerInvite>{};
    for (final invite in [...inviter, ...invitee]) {
      if (!invite.isAccepted) continue;
      final regId = invite.registrationId?.trim() ?? '';
      if (regId.isEmpty) continue;
      byRegId.putIfAbsent(regId, () => invite);
    }
    return byRegId.values.toList();
  }

  void _onInviterInvitesUpdated(List<TournamentPartnerInvite> invites) {
    if (!_inviterSeeded) {
      for (final invite in invites) {
        _statusByInviteId[invite.id] = invite.status;
        if (invite.isAccepted) {
          _handledAcceptIds.add(invite.id);
        }
      }
      _inviterSeeded = true;
      unawaited(_markAlreadyPaidRegistrations(invites));
      return;
    }

    for (final invite in invites) {
      final prior = _statusByInviteId[invite.id];
      _statusByInviteId[invite.id] = invite.status;
      if (prior == 'pending' && invite.isAccepted) {
        unawaited(_handleInviteAccepted(invite));
      }
    }
  }

  Future<void> _markAlreadyPaidRegistrations(
    List<TournamentPartnerInvite> invites,
  ) async {
    for (final invite in invites) {
      if (!invite.isAccepted) continue;
      final regId = invite.registrationId?.trim() ?? '';
      if (regId.isEmpty || _handledPaidRegistrationIds.contains(regId)) {
        continue;
      }
      final snap = await ref
          .read(tournamentRegistrationSnapshotProvider(regId).future);
      if (snap?.isPaid == true) {
        _handledPaidRegistrationIds.add(regId);
      }
    }
  }

  bool _shouldDeferRegistrationPaidNavigation(String tournamentId) {
    final location = GoRouterState.of(context).uri.toString();
    if (location.contains('/inscricao/sucesso')) return true;
    return location.contains('/torneios/$tournamentId/inscricao');
  }

  String _categoryNameFromInvite(
    TournamentPartnerInvite invite,
    TournamentDetail? tournament,
  ) {
    if (tournament == null) return invite.categoryId;
    for (final offer in tournament.categoryOffers) {
      if (offer.id == invite.categoryId) {
        return offer.name.isNotEmpty ? offer.name : offer.id;
      }
    }
    return invite.categoryId;
  }

  Future<void> _navigateToRegistrationSuccess(
    TournamentPartnerInvite invite,
  ) async {
    final regId = invite.registrationId?.trim() ?? '';
    if (regId.isEmpty || _handledPaidRegistrationIds.contains(regId)) return;
    if (_shouldDeferRegistrationPaidNavigation(invite.tournamentId)) return;

    final snap = await ref
        .read(tournamentRegistrationSnapshotProvider(regId).future);
    if (!mounted || snap?.isPaid != true) return;

    _handledPaidRegistrationIds.add(regId);

    final tournament = await ref
        .read(tournamentDetailProvider(invite.tournamentId).future);
    if (!mounted) return;

    final tournamentName = tournament?.name.trim() ?? '';
    if (tournamentName.isEmpty) return;

    final categoryName = _categoryNameFromInvite(invite, tournament);

    showAppSnackBar(context, 'Dupla inscrita! Pagamento confirmado.');
    navigateToTournamentRegistrationSuccess(
      context,
      tournamentId: invite.tournamentId,
      registrationId: regId,
      tournamentName: tournamentName,
      categoryName: categoryName,
    );
  }

  Future<void> _handleInviteAccepted(TournamentPartnerInvite invite) async {
    if (_handledAcceptIds.contains(invite.id)) return;
    final regId = invite.registrationId?.trim() ?? '';
    if (regId.isEmpty) return;

    final snap = await ref
        .read(tournamentRegistrationSnapshotProvider(regId).future);
    if (!mounted) return;

    _handledAcceptIds.add(invite.id);

    if (snap?.isPaid == true) {
      await _navigateToRegistrationSuccess(invite);
      return;
    }

    final access = ref.read(tournamentAccessStateProvider);
    if (!access.canAccess) {
      if (!context.mounted) return;
      final message = access.snackbarMessage;
      if (message != null) {
        showAppSnackBar(context, message, isError: true);
      }
      if (!access.onboardingCompleted) {
        context.go(AppRoutes.athleteOnboardingWelcome);
      } else {
        context.pushNamed(AppRouteNames.athleteCompleteProfile);
      }
      return;
    }

    final firstName = invite.inviteeName.split(' ').first;
    _showPaymentSnackBar(invite, firstName);
  }

  void _showPaymentSnackBar(TournamentPartnerInvite invite, String firstName) {
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
            final snackAccess = ref.read(tournamentAccessStateProvider);
            if (!snackAccess.canAccess) {
              final message = snackAccess.blockMessage;
              if (message != null) {
                showAppSnackBar(context, message, isError: true);
              }
              if (!snackAccess.onboardingCompleted) {
                context.go(AppRoutes.athleteOnboardingWelcome);
              } else {
                context.pushNamed(AppRouteNames.athleteCompleteProfile);
              }
              return;
            }
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
