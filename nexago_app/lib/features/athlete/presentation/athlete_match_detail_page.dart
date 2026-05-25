import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/match_history/athlete_match_detail_models.dart';
import '../domain/match_history/athlete_match_detail_providers.dart';
import 'widgets/match_detail/match_detail_info_section.dart';
import 'widgets/match_detail/match_detail_mvp_card.dart';
import 'widgets/match_detail/match_detail_summary_card.dart';

/// Detalhes de uma partida do histórico (protótipo 09).
class AthleteMatchDetailPage extends ConsumerWidget {
  const AthleteMatchDetailPage({super.key, required this.matchId});

  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(athleteMatchDetailProvider(matchId));
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: _appBar(context, theme),
      body: detailAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (_, _) => _messageBody(
          theme,
          'Não foi possível carregar os detalhes da partida.',
        ),
        data: (detail) {
          if (detail == null) {
            return _messageBody(theme, 'Partida não encontrada.');
          }
          return _DetailBody(detail: detail);
        },
      ),
    );
  }

  PreferredSizeWidget _appBar(BuildContext context, ThemeData theme) {
    return AppBar(
      backgroundColor: AppColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: AppColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () => context.pop(),
              borderRadius: BorderRadius.circular(12),
              child: const SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: AppColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        'Detalhes da partida',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: AppColors.onSurface,
          letterSpacing: -0.3,
        ),
      ),
      actions: [
        Padding(
          padding: const EdgeInsets.only(right: 12),
          child: Material(
            color: AppColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () => showAppSnackBar(context, 'Em breve.'),
              borderRadius: BorderRadius.circular(12),
              child: const SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.ios_share_rounded,
                  color: AppColors.onSurface,
                  size: 20,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _messageBody(ThemeData theme, String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyLarge?.copyWith(
            color: AppColors.onSurfaceMuted,
          ),
        ),
      ),
    );
  }
}

class _DetailBody extends StatelessWidget {
  const _DetailBody({required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        MatchDetailSummaryCard(detail: detail),
        const SizedBox(height: 16),
        MatchDetailInfoSection(
          rows: [
            MatchDetailInfoRow(
              icon: Icons.emoji_events_outlined,
              label: 'TORNEIO',
              value: detail.tournamentName,
            ),
            MatchDetailInfoRow(
              icon: Icons.calendar_today_outlined,
              label: 'DATA',
              value: detail.dateTimeLabel,
            ),
            MatchDetailInfoRow(
              icon: Icons.location_on_outlined,
              label: 'LOCAL',
              value: detail.venueLabel,
            ),
            MatchDetailInfoRow(
              icon: Icons.sports_volleyball_outlined,
              label: 'CATEGORIA',
              value: detail.categoryLabel,
            ),
            MatchDetailInfoRow(
              icon: Icons.timer_outlined,
              label: 'DURAÇÃO',
              value: detail.durationLabel,
            ),
          ],
        ),
        if (detail.hasMvp) ...[
          const SizedBox(height: 16),
          MatchDetailMvpCard(summary: detail.mvpSummary!),
        ],
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: _OutlineActionButton(
                icon: Icons.emoji_events_outlined,
                label: 'Ir ao torneio',
                onTap: () => _onTournament(context),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _OutlineActionButton(
                icon: Icons.refresh_rounded,
                label: 'Revanche',
                accent: AppColors.brand,
                onTap: () => showAppSnackBar(context, 'Em breve.'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _onTournament(BuildContext context) {
    final id = detail.tournamentId?.trim();
    if (id != null && id.isNotEmpty) {
      context.pushNamed(
        AppRouteNames.athleteTournamentDetail,
        pathParameters: {'tournamentId': id},
      );
      return;
    }
    showAppSnackBar(context, 'Em breve.');
  }
}

class _OutlineActionButton extends StatelessWidget {
  const _OutlineActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.accent,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = accent ?? AppColors.onSurface;

    return Material(
      color: AppColors.surfaceCard,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: (accent ?? AppColors.onSurfaceMuted)
                  .withValues(alpha: accent != null ? 0.6 : 0.25),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
