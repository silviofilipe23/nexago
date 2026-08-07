import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../domain/match_history/athlete_match_detail_providers.dart';
import '../domain/match_history/match_detail_play_by_play_timeline_logic.dart';
import 'widgets/match_detail/match_detail_play_by_play_timeline_widgets.dart';
import 'widgets/match_detail/match_detail_share_section.dart';

class AthleteMatchPlayByPlayPage extends ConsumerStatefulWidget {
  const AthleteMatchPlayByPlayPage({super.key, required this.matchId});

  final String matchId;

  @override
  ConsumerState<AthleteMatchPlayByPlayPage> createState() =>
      _AthleteMatchPlayByPlayPageState();
}

class _AthleteMatchPlayByPlayPageState
    extends ConsumerState<AthleteMatchPlayByPlayPage> {
  int? _selectedSetIndex;

  @override
  Widget build(BuildContext context) {
    final detailAsync = ref.watch(athleteMatchDetailProvider(widget.matchId));

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: detailAsync.when(
          loading: () => Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
          error: (_, __) => const _EmptyState(
            message: 'Não foi possível carregar o histórico de pontos.',
          ),
          data: (detail) {
          if (detail == null) {
            return const _EmptyState(message: 'Partida não encontrada.');
          }
          if (detail.playByPlayGroups.isEmpty) {
            return const _EmptyState(
              message: 'Ainda não há pontos registrados nesta partida.',
            );
          }

          final selectedSetIndex =
              _selectedSetIndex ?? defaultPlayByPlaySetIndex(detail);
          final group = playByPlayGroupForSet(detail, selectedSetIndex);
          final timeline = group == null
              ? null
              : buildPlayByPlaySetTimeline(group: group, detail: detail);

            return Column(
              children: [
                PlayByPlayPageHeader(
                  subtitle: buildPlayByPlaySubtitle(detail),
                  onBack: () => context.pop(),
                  onShare: detail.sharePoster != null
                      ? () => showMatchDetailShareSheet(
                          context,
                          detail.sharePoster!,
                        )
                      : null,
                ),
                PlayByPlayScoreboard(detail: detail),
                PlayByPlaySetTabs(
                  sets: detail.sets,
                  selectedSetIndex: selectedSetIndex,
                  onSelected: (index) {
                    setState(() => _selectedSetIndex = index);
                  },
                ),
                PlayByPlayTeamHeaders(
                  ourTeamLabel: detail.ourTeam.label,
                  opponentTeamLabel: detail.opponentTeam.label,
                ),
                Expanded(
                  child: SingleChildScrollView(
                    child: timeline == null
                        ? const Padding(
                            padding: EdgeInsets.all(24),
                            child: Center(
                              child: Text(
                                'Sem pontos registrados neste set.',
                                style: TextStyle(
                                  color: AppColors.onSurfaceMuted,
                                ),
                              ),
                            ),
                          )
                        : PlayByPlayStreakTimeline(timeline: timeline),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            color: AppColors.onSurfaceMuted,
          ),
        ),
      ),
    );
  }
}
