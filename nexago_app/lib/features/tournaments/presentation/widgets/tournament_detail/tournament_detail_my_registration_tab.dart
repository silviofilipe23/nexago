import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../../core/ui/nexa_card.dart';
import '../../../../athlete/domain/athlete_home_registration_progress_providers.dart';
import '../../../../athlete/presentation/widgets/athlete_home/athlete_home_registration_tracker.dart';
import '../../../data/my_tournament_registrations_repository.dart';
import '../../../domain/registration_progress_logic.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_registration_navigation.dart';
import '../tournament_registration/registration_cancellation_flow.dart';

/// Aba "Minha inscrição" (paridade com o portal): trilha de passos das
/// inscrições em andamento neste torneio + card das já confirmadas.
class TournamentDetailMyRegistrationTab extends ConsumerStatefulWidget {
  const TournamentDetailMyRegistrationTab({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  ConsumerState<TournamentDetailMyRegistrationTab> createState() =>
      _TournamentDetailMyRegistrationTabState();
}

class _TournamentDetailMyRegistrationTabState
    extends ConsumerState<TournamentDetailMyRegistrationTab> {
  bool _cancelling = false;

  void _continueRegistration(RegistrationProgress item) {
    context.pushNamed(
      AppRouteNames.tournamentRegistration,
      pathParameters: {'tournamentId': item.tournamentId},
      queryParameters: registrationProgressResumeParams(item),
    );
  }

  Future<void> _cancelRegistration(RegistrationProgress item) async {
    if (_cancelling) return;
    final cancelled = await runRegistrationCancellationFlow(
      context,
      ref,
      registrationId: item.registrationId,
      tournamentName: item.tournamentName,
      categoryName: item.categoryName,
      canCancelDirectly: true,
      onSubmittingChanged: (v) {
        if (mounted) setState(() => _cancelling = v);
      },
    );
    if (!cancelled || !mounted) return;

    showAppSnackBar(context, 'Inscrição cancelada.');
    ref.invalidate(myTournamentRegistrationsProvider);
    ref.invalidate(athleteHomeInProgressRegistrationsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final inProgress = (ref
                .watch(athleteHomeInProgressRegistrationsProvider)
                .valueOrNull ??
            const <RegistrationProgress>[])
        .where((item) => item.tournamentId == widget.tournamentId)
        .toList();
    final inProgressIds = inProgress.map((i) => i.registrationId).toSet();
    final confirmed = (ref
                .watch(myTournamentRegistrationsProvider)
                .valueOrNull ??
            const <MyTournamentRegistration>[])
        .where(
          (reg) =>
              reg.tournamentId == widget.tournamentId &&
              !inProgressIds.contains(reg.registrationId),
        )
        .toList();

    if (inProgress.isEmpty && confirmed.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Text(
          'Você ainda não tem inscrição neste torneio.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.lg,
        AppSpacing.screenH,
        AppSpacing.xxl,
      ),
      children: [
        if (inProgress.isNotEmpty)
          AthleteHomeRegistrationTracker(
            items: inProgress,
            onContinue: _continueRegistration,
            onCancel: _cancelRegistration,
          ),
        for (final reg in confirmed) ...[
          if (inProgress.isNotEmpty || reg != confirmed.first)
            const SizedBox(height: AppSpacing.md),
          _ConfirmedRegistrationCard(registration: reg),
        ],
      ],
    );
  }
}

/// Card de inscrição confirmada — toque abre o detalhe (Task 4), que reúne
/// status, histórico de trocas e as ações de substituir/cancelar (antes
/// vivendo espalhadas aqui: TextButton "Substituir atleta" + histórico).
class _ConfirmedRegistrationCard extends StatelessWidget {
  const _ConfirmedRegistrationCard({required this.registration});

  final MyTournamentRegistration registration;

  void _openRegistrationDetail(BuildContext context) {
    context.pushNamed(
      AppRouteNames.tournamentRegistrationDetail,
      pathParameters: {
        'tournamentId': registration.tournamentId,
        'registrationId': registration.registrationId,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final categoryName = registration.category?.name ?? 'Categoria';
    final statusColor =
        registration.isPaid ? AppColors.win : AppColors.pending;

    return NexaCard(
      onTap: () => _openRegistrationDetail(context),
      child: Row(
        children: [
          Icon(Icons.verified_outlined, size: 22, color: statusColor),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  categoryName,
                  style: AppTypography.titleS.copyWith(color: colors.onSurface),
                ),
                const SizedBox(height: 2),
                Text(
                  registration.statusLabel,
                  style: AppTypography.bodyS.copyWith(color: statusColor),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
        ],
      ),
    );
  }
}
