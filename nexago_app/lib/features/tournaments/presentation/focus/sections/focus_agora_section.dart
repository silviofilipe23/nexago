import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_now_state.dart';
import '../../../domain/focus/focus_providers.dart';
import '../../../domain/focus/focus_views_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_detail_tabs_logic.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_match.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../../domain/tournament_match_status.dart';
import '../../widgets/tournament_match_card.dart';
import '../focus_section_header.dart';

/// Seção "Agora": o que o atleta precisa saber nos próximos minutos, seguido
/// da ordem do dia e do que está em quadra na categoria dele.
class FocusAgoraSection extends ConsumerWidget {
  const FocusAgoraSection({
    super.key,
    required this.tournament,
    required this.categoryId,
    required this.athleteTeamIds,
  });

  final TournamentDetail tournament;
  final String? categoryId;
  final Set<String> athleteTeamIds;

  void _openMatch(BuildContext context, String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return;
    context.pushNamed(
      AppRouteNames.athleteMatchDetail,
      pathParameters: {'matchId': id},
      queryParameters: {AppRoutes.matchDetailFromTournamentQuery: '1'},
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final cardsAsync = ref.watch(tournamentMatchCardsProvider(tournament.id));

    return cardsAsync.when(
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.only(top: 60),
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      ),
      error: (_, _) => Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Text(
          'Não foi possível carregar as partidas de hoje.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
        ),
      ),
      data: (cards) => _body(context, ref, cards),
    );
  }

  Widget _body(
    BuildContext context,
    WidgetRef ref,
    List<TournamentMatchCardViewModel> cards,
  ) {
    final colors = context.themeColors;
    final byId = {for (final c in cards) c.match.id: c};
    final all = [for (final c in cards) c.match];

    // Nome por ID DE TIME, montado a partir dos dois lados de cada card. O
    // `byId` acima é indexado por id de PARTIDA — consultá-lo com um teamId
    // devolve null em silêncio e todo adversário vira "A definir".
    final teamNames = <String, String>{};
    for (final c in cards) {
      if (c.match.teamAId.isNotEmpty) {
        teamNames[c.match.teamAId] = c.teamA.displayName;
      }
      if (c.match.teamBId.isNotEmpty) {
        teamNames[c.match.teamBId] = c.teamB.displayName;
      }
    }
    final now = DateTime.now();

    // A categoria em foco recorta TUDO: `poolId` só é único dentro dela.
    final categoryMatches = categoryId == null
        ? all
        : all.where((m) => m.categoryId == categoryId).toList();

    final day = myTournamentDayTimeline(
      all,
      athleteTeamIds,
      now,
      tournamentRunningToday: tournamentIsEventToday(tournament, now),
    );

    final next = _nextMatchOf(day, all);
    final acknowledged = ref.watch(focusAcknowledgedCallProvider);
    final state = focusNowStateOf(
      next,
      acknowledged,
      categoryHasPendingKnockout: categoryId != null &&
          hasPendingKnockoutInCategory(categoryMatches, categoryId!) &&
          !eliminatedFromKnockout(categoryMatches, categoryId!, athleteTeamIds),
    );

    final ctx = FocusViewContext(
      matches: categoryMatches,
      myTeamIds: athleteTeamIds,
      duoNameOf: (teamId, [fallback]) =>
          teamNames[teamId] ?? fallback ?? 'A definir',
      standingsOf: (_) => const [],
      nextMatch: next,
    );
    final entries = timelineOf(ctx, day);

    final live = categoryMatches
        .where((m) => TournamentMatchStatus.isInProgress(m.status))
        .where((m) => m.id != next?.id)
        .toList();

    return ListView(
      padding: const EdgeInsets.only(
        top: AppSpacing.md,
        bottom: AppSpacing.xxxl,
      ),
      children: [
        _MainBlock(
          state: state,
          match: next,
          card: next == null ? null : byId[next.id],
          athleteTeamIds: athleteTeamIds,
          onAcknowledge: () => ref
              .read(focusAcknowledgedCallProvider.notifier)
              .acknowledge(next!.id),
          onOpen: (id) => _openMatch(context, id),
        ),
        if (entries.isNotEmpty) ...[
          const FocusSectionHeader(label: 'ORDEM DO SEU DIA'),
          _Timeline(
            entries: entries,
            onOpen: (id) => _openMatch(context, id),
          ),
        ],
        if (live.isNotEmpty) ...[
          const FocusSectionHeader(label: 'AO VIVO NA SUA CATEGORIA', live: true),
          for (final m in live)
            if (byId[m.id] != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  0,
                  AppSpacing.screenH,
                  AppSpacing.lg,
                ),
                child: TournamentMatchCard(
                  viewModel: byId[m.id]!,
                  athleteTeamIds: athleteTeamIds,
                  onTap: () => _openMatch(context, m.id),
                ),
              ),
        ],
        if (entries.isEmpty && live.isEmpty && next == null)
          Padding(
            padding: const EdgeInsets.all(AppSpacing.xxl),
            child: Text(
              'Nada acontecendo agora — seus jogos aparecem aqui, com ou sem '
              'horário definido.',
              textAlign: TextAlign.center,
              style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
            ),
          ),
      ],
    );
  }

  /// A próxima partida relevante: chamada de quadra e ao vivo primeiro, depois
  /// a mais cedo do dia. Mesma precedência de `athleteMatchPriority`.
  TournamentMatch? _nextMatchOf(
    List<TournamentMatch> day,
    List<TournamentMatch> all,
  ) {
    final mine = day
        .where((m) => !TournamentMatchStatus.isCompleted(m.status))
        .toList();
    if (mine.isEmpty) return null;
    for (final m in mine) {
      if (m.queueStatus == kQueueStatusOnCourt) return m;
    }
    for (final m in mine) {
      if (TournamentMatchStatus.isInProgress(m.status)) return m;
    }
    return mine.first;
  }
}

/// O bloco principal, pelo estado. Cada ramo diz uma coisa diferente e nenhum
/// deles inventa: `pendingKnockout` fala da CATEGORIA ("a chave ainda vai
/// sair"), nunca do futuro do atleta.
class _MainBlock extends StatelessWidget {
  const _MainBlock({
    required this.state,
    required this.match,
    required this.card,
    required this.athleteTeamIds,
    required this.onAcknowledge,
    required this.onOpen,
  });

  final FocusNowState state;
  final TournamentMatch? match;
  final TournamentMatchCardViewModel? card;
  final Set<String> athleteTeamIds;
  final VoidCallback onAcknowledge;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final padding = const EdgeInsets.fromLTRB(
      AppSpacing.screenH,
      0,
      AppSpacing.screenH,
      AppSpacing.lg,
    );

    switch (state) {
      case FocusNowState.called:
        return Padding(
          padding: padding,
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(
              color: AppColors.live,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'CHAMADA DE QUADRA',
                  style: AppTypography.eyebrow.copyWith(color: Colors.white),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Sua partida foi chamada. Vá para a quadra.',
                  style: AppTypography.titleM.copyWith(color: Colors.white),
                ),
                const SizedBox(height: AppSpacing.lg),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: onAcknowledge,
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: AppColors.live,
                    ),
                    // Só recolhe o alerta. Não existe callable para avisar a
                    // mesa, e o rótulo não promete mais do que isso.
                    child: const Text('Ok, estou indo'),
                  ),
                ),
              ],
            ),
          ),
        );

      case FocusNowState.live:
      case FocusNowState.next:
        final vm = card;
        if (vm == null) return const SizedBox.shrink();
        return Padding(
          padding: padding,
          child: TournamentMatchCard(
            viewModel: vm,
            athleteTeamIds: athleteTeamIds,
            onTap: () => onOpen(vm.match.id),
          ),
        );

      case FocusNowState.pendingKnockout:
        return Padding(
          padding: padding,
          child: _Message(
            title: 'A chave ainda vai sair',
            body: 'O mata-mata da sua categoria ainda tem jogos por definir. '
                'Adversário e quadra aparecem aqui assim que o organizador '
                'publicar.',
            colors: colors,
          ),
        );

      case FocusNowState.idle:
        return Padding(
          padding: padding,
          child: _Message(
            title: 'Seu dia acabou por aqui',
            body: 'Você não tem mais partidas neste torneio.',
            colors: colors,
          ),
        );
    }
  }
}

class _Message extends StatelessWidget {
  const _Message({
    required this.title,
    required this.body,
    required this.colors,
  });

  final String title;
  final String body;
  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: AppTypography.titleM.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            body,
            style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
          ),
        ],
      ),
    );
  }
}

/// A ordem do dia. As partidas sem horário ganham um divisor próprio, depois
/// das agendadas — elas passaram a entrar na lista quando a regra deixou de
/// exigir `scheduleTime`.
class _Timeline extends StatelessWidget {
  const _Timeline({required this.entries, required this.onOpen});

  final List<TimelineEntry> entries;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final rows = <Widget>[];

    for (var i = 0; i < entries.length; i++) {
      final entry = entries[i];
      final firstWithoutTime =
          entry.time == null && (i == 0 || entries[i - 1].time != null);
      if (firstWithoutTime) {
        rows.add(const FocusSectionHeader(label: 'SEM HORÁRIO DEFINIDO'));
      }
      rows.add(
        InkWell(
          onTap: entry.clickable ? () => onOpen(entry.matchId) : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenH,
              vertical: AppSpacing.md,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 52,
                  child: Text(
                    entry.time ?? '—',
                    style: AppTypography.bodyM.copyWith(
                      color: entry.state == TimelineState.next
                          ? colors.brand
                          : colors.onSurfaceMuted,
                    ),
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry.title,
                        style: AppTypography.bodyM
                            .copyWith(color: colors.onSurface),
                      ),
                      if (entry.note != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            entry.note!,
                            style: AppTypography.bodyS
                                .copyWith(color: colors.brand),
                          ),
                        ),
                      if (entry.detail != null && entry.detail!.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            entry.detail!,
                            style: AppTypography.bodyS
                                .copyWith(color: colors.onSurfaceMuted),
                          ),
                        ),
                    ],
                  ),
                ),
                if (entry.outcomeLabel != null)
                  Text(
                    entry.outcomeLabel!,
                    style: AppTypography.bodyM.copyWith(
                      color: entry.outcome == TimelineOutcome.win
                          ? colors.win
                          : colors.onSurfaceMuted,
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
    }

    return Column(children: rows);
  }
}
