import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/nexa_icon_square_button.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../domain/tournament_detail_tabs_logic.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_matches_logic.dart';
import 'widgets/tournament_detail/tournament_detail_today_tab.dart';

/// "Hoje" do torneio — jogos em quadra agora + a timeline do atleta no dia
/// (aberto pelo card correspondente da Visão geral).
class TournamentTodayPage extends ConsumerWidget {
  const TournamentTodayPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final topInset = MediaQuery.paddingOf(context).top;
    final teamIdsByCategory = ref
            .watch(tournamentUserTeamIdsByCategoryProvider(tournamentId))
            .valueOrNull ??
        const <String, String>{};
    // Enquanto o detalhe carrega, `false`: sem as datas do torneio não dá pra
    // afirmar que uma partida sem horário é de hoje.
    final tournament =
        ref.watch(tournamentDetailProvider(tournamentId)).valueOrNull;
    final tournamentRunningToday = tournament != null &&
        tournamentIsEventToday(tournament, DateTime.now());

    return Scaffold(
      backgroundColor: colors.canvas,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: topInset + AppSpacing.xs),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
            child: Row(
              children: [
                NexaIconSquareButton(
                  icon: Icons.arrow_back_rounded,
                  onTap: () => context.pop(),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              AppSpacing.sm,
              AppSpacing.screenH,
              AppSpacing.xs,
            ),
            child: Text(
              'Hoje no torneio',
              style: AppTypography.titleL.copyWith(color: colors.onSurface),
            ),
          ),
          Expanded(
            child: TournamentDetailTodayTab(
              tournamentId: tournamentId,
              athleteTeamIds: athleteTeamIdsForHighlight(teamIdsByCategory),
              tournamentRunningToday: tournamentRunningToday,
            ),
          ),
        ],
      ),
    );
  }
}
