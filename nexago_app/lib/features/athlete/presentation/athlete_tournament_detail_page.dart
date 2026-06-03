import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/match_history/athlete_tournament_detail_models.dart';
import '../domain/match_history/athlete_tournament_detail_providers.dart';
import 'widgets/tournament_detail/tournament_detail_campaign_section.dart';
import 'widgets/tournament_detail/tournament_detail_info_cards.dart';
import 'widgets/tournament_detail/tournament_detail_summary_card.dart';

/// Detalhes do torneio na visão do atleta — campanha e jogos (protótipo 10).
class AthleteTournamentDetailPage extends ConsumerWidget {
  const AthleteTournamentDetailPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(athleteTournamentDetailProvider(tournamentId));
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: _appBar(context, theme, detailAsync.valueOrNull?.name),
      body: detailAsync.when(
        loading: () => Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (_, __) => _messageBody(
          theme,
          'Não foi possível carregar o torneio.',
        ),
        data: (detail) {
          if (detail == null) {
            return _messageBody(theme, 'Torneio não encontrado.');
          }
          return _DetailBody(detail: detail);
        },
      ),
    );
  }

  PreferredSizeWidget _appBar(
    BuildContext context,
    ThemeData theme,
    String? title,
  ) {
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
              child: SizedBox(
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
        title ?? 'Torneio',
        style: theme.textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w800,
          color: AppColors.onSurface,
          letterSpacing: -0.2,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
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
              child: SizedBox(
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

  final AthleteTournamentDetail detail;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        TournamentDetailSummaryCard(detail: detail),
        SizedBox(height: 12),
        TournamentDetailInfoCards(detail: detail),
        SizedBox(height: 24),
        TournamentDetailCampaignSection(
          detail: detail,
          onMatchTap: (match) => _onMatchTap(context, match),
        ),
      ],
    );
  }

  void _onMatchTap(BuildContext context, AthleteTournamentCampaignMatch match) {
    final matchId = match.matchId?.trim();
    if (matchId == null || matchId.isEmpty) {
      showAppSnackBar(context, 'Em breve.');
      return;
    }
    context.pushNamed(
      AppRouteNames.athleteMatchDetail,
      pathParameters: {'matchId': matchId},
      queryParameters: {AppRoutes.matchDetailFromTournamentQuery: '1'},
    );
  }
}
