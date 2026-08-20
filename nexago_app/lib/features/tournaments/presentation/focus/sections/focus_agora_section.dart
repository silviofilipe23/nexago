import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../data/tournament_announcements_repository.dart';
import '../../../domain/focus/focus_now_state.dart';
import '../../../domain/focus/focus_providers.dart';
import '../../../domain/focus/focus_views_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_detail_tabs_logic.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_match.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../../domain/tournament_match_display.dart';
import '../../../domain/tournament_match_status.dart';
import '../../widgets/tournament_match_card.dart';
import '../focus_section_header.dart';
import '../widgets/focus_now_hero.dart';
import '../widgets/focus_share_match_sheet.dart';
import '../widgets/focus_timeline.dart';

/// Seção "Agora": o que o atleta precisa saber nos próximos minutos, seguido da
/// ordem do dia, dos avisos do organizador e do que está em quadra na categoria
/// dele. Mesma ordem e mesma cópia do portal.
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

  /// Rota até a ARENA, não até a quadra: as quadras do torneio são só `{id,
  /// name}`, sem posição. O rótulo nomeia a arena justamente para não prometer
  /// o que não temos.
  Future<void> _openMaps() async {
    final query = tournament.locationAddress?.trim().isNotEmpty == true
        ? tournament.locationAddress!.trim()
        : '${tournament.location}, ${tournament.city}';
    final uri = Uri.parse(
      'https://www.google.com/maps/search/?api=1'
      '&query=${Uri.encodeComponent(query)}',
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  String get _mapsLabel {
    final location = tournament.location.trim();
    return location.isNotEmpty ? 'Como chegar na $location' : 'Como chegar';
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
    final now = DateTime.now();

    // Nome por ID DE TIME: `byId` é indexado por id de PARTIDA, e consultá-lo
    // com um teamId devolve null em silêncio — todo adversário viraria
    // "A definir".
    final teamNames = <String, String>{};
    for (final c in cards) {
      if (c.match.teamAId.isNotEmpty) {
        teamNames[c.match.teamAId] = c.teamA.displayName;
      }
      if (c.match.teamBId.isNotEmpty) {
        teamNames[c.match.teamBId] = c.teamB.displayName;
      }
    }

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

    final next = _nextMatchOf(day);
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

    final heroView = nextMatchViewOf(ctx, now);
    final entries = timelineOf(ctx, day);
    final announcements =
        ref.watch(tournamentAnnouncementsProvider(tournament.id)).valueOrNull ??
            const [];

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
        FocusNowHero(
          state: state,
          view: heroView,
          card: next == null ? null : byId[next.id],
          calledAt: next?.matchStartedAt != null
              ? matchTimeLabelForCard(next!)
              : null,
          mapsLabel: _mapsLabel,
          onAcknowledge: () => ref
              .read(focusAcknowledgedCallProvider.notifier)
              .acknowledge(next!.id),
          onOpenMatch: () => _openMatch(context, next!.id),
          onOpenMaps: _openMaps,
          onShare: () => showFocusShareMatchSheet(context, next!.id),
        ),
        FocusSectionHeader(label: 'ORDEM DO SEU DIA'.toUpperCase()),
        if (entries.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenH,
              vertical: AppSpacing.sm,
            ),
            child: Text(
              'Nenhuma partida sua hoje.',
              style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
            ),
          )
        else
          FocusTimeline(
            entries: entries,
            onOpen: (id) => _openMatch(context, id),
          ),
        if (announcements.isNotEmpty) ...[
          const FocusSectionHeader(label: 'AVISOS DO ORGANIZADOR'),
          for (final a in announcements)
            _Announcement(
              time: a.createdAt != null ? _hhmm(a.createdAt!) : '',
              message: a.message,
            ),
        ],
        if (live.isNotEmpty) ...[
          const FocusSectionHeader(
            label: 'AO VIVO NA SUA CATEGORIA',
            live: true,
          ),
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
      ],
    );
  }

  static String _hhmm(DateTime at) {
    final local = at.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }

  /// A próxima partida relevante: chamada de quadra e ao vivo primeiro, depois
  /// a mais cedo do dia. Mesma precedência de `athleteMatchPriority`.
  TournamentMatch? _nextMatchOf(List<TournamentMatch> day) {
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

class _Announcement extends StatelessWidget {
  const _Announcement({required this.time, required this.message});

  final String time;
  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 48,
            child: Text(
              time,
              style: AppTypography.monoMeta
                  .copyWith(color: colors.onSurfaceMuted),
            ),
          ),
          Expanded(
            child: Text(
              message,
              style: AppTypography.bodyM.copyWith(color: colors.onSurface),
            ),
          ),
        ],
      ),
    );
  }
}
