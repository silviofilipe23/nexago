import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/match_history/athlete_match_detail_models.dart';
import '../domain/match_history/athlete_match_detail_providers.dart';
import 'widgets/match_detail/match_detail_countdown_card.dart';
import 'widgets/match_detail/match_detail_footer.dart';
import 'widgets/match_detail/match_detail_form_section.dart';
import 'widgets/match_detail/match_detail_head_to_head_section.dart';
import 'widgets/match_detail/match_detail_hero_card.dart';
import 'widgets/match_detail/match_detail_live_score_panel.dart';
import 'widgets/match_detail/match_detail_momentum_section.dart';
import 'widgets/match_detail/match_detail_play_by_play_section.dart';
import 'widgets/match_detail/match_detail_set_timeline_section.dart';
import 'widgets/match_detail/match_detail_share_section.dart';
import 'widgets/match_detail/match_detail_where_when_section.dart';
import 'widgets/match_detail/match_detail_xp_card.dart';

/// Detalhes de uma partida do histórico (protótipo B).
class AthleteMatchDetailPage extends ConsumerWidget {
  const AthleteMatchDetailPage({
    super.key,
    required this.matchId,
    this.hideTournamentAction = false,
  });

  final String matchId;
  final bool hideTournamentAction;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(athleteMatchDetailProvider(matchId));
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: _appBar(context, theme, detailAsync.valueOrNull),
      body: detailAsync.when(
        loading: () =>
            Center(child: CircularProgressIndicator(color: AppColors.brand)),
        error: (error, stackTrace) => _messageBody(
          theme,
          'Não foi possível carregar os detalhes da partida.',
        ),
        data: (detail) {
          if (detail == null) {
            return _messageBody(theme, 'Partida não encontrada.');
          }
          return _DetailBody(
            detail: detail,
            hideTournamentAction: hideTournamentAction,
          );
        },
      ),
    );
  }

  PreferredSizeWidget _appBar(
    BuildContext context,
    ThemeData theme,
    AthleteMatchDetail? detail,
  ) {
    return NexaAppBar(
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
              onTap: () {
                final share = detail?.shareInfo;
                if (share != null) {
                  showMatchDetailShareSheet(context, share);
                } else {
                  showAppSnackBar(context, 'Em breve.');
                }
              },
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
  const _DetailBody({required this.detail, required this.hideTournamentAction});

  final AthleteMatchDetail detail;
  final bool hideTournamentAction;

  @override
  Widget build(BuildContext context) {
    if (detail.phase == MatchDetailPhase.canceled) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          MatchDetailHeroCard(detail: detail),
          SizedBox(height: 24),
          Text(
            'Esta partida foi cancelada.',
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(color: AppColors.onSurfaceMuted),
          ),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        MatchDetailHeroCard(detail: detail),
        SizedBox(height: 16),
        ..._phaseSections(context),
        SizedBox(height: 24),
        MatchDetailFooter(
          kind: _footerKind,
          hideTournamentAction: hideTournamentAction,
          onTournament: () => _onTournament(context),
          onRematch: () => showAppSnackBar(context, 'Em breve.'),
          onOpponentProfile: () => showAppSnackBar(context, 'Em breve.'),
          onShare: detail.shareInfo != null
              ? () => showMatchDetailShareSheet(context, detail.shareInfo!)
              : null,
        ),
      ],
    );
  }

  MatchDetailFooterKind get _footerKind {
    if (!detail.isParticipantView) {
      return MatchDetailFooterKind.spectator;
    }
    return switch (detail.phase) {
      MatchDetailPhase.completed => MatchDetailFooterKind.completed,
      MatchDetailPhase.live => MatchDetailFooterKind.live,
      MatchDetailPhase.scheduled => MatchDetailFooterKind.scheduled,
      MatchDetailPhase.canceled => MatchDetailFooterKind.spectator,
    };
  }

  List<Widget> _phaseSections(BuildContext context) {
    return switch (detail.phase) {
      MatchDetailPhase.completed => _completedSections(context),
      MatchDetailPhase.live => _liveSections(context),
      MatchDetailPhase.scheduled => _scheduledSections(context),
      MatchDetailPhase.canceled => const [],
    };
  }

  List<Widget> _completedSections(BuildContext context) {
    final sections = <Widget>[];

    if (detail.isParticipantView && detail.xpInfo != null) {
      sections.addAll([
        MatchDetailXpCard(xp: detail.xpInfo!),
        SizedBox(height: 16),
      ]);
    }

    if (detail.momentumInfo != null) {
      sections.addAll([
        MatchDetailMomentumSection(
          momentum: detail.momentumInfo!,
          onViewPlayByPlay: detail.playByPlay.isNotEmpty
              ? () => _openPlayByPlay(context)
              : null,
        ),
        SizedBox(height: 20),
      ]);
    }

    sections.addAll(_playByPlaySection(context));

    if (detail.setTimelineItems.isNotEmpty) {
      sections.addAll([
        MatchDetailSetTimelineSection(items: detail.setTimelineItems),
        SizedBox(height: 20),
      ]);
    }

    if (detail.isParticipantView && detail.headToHead != null) {
      sections.addAll([
        MatchDetailHeadToHeadSection(info: detail.headToHead!),
        SizedBox(height: 20),
      ]);
    }

    sections.addAll([
      MatchDetailWhereWhenSection(
        detail: detail,
        showActions: false,
        onViewBracket: () => _onTournament(context),
      ),
      SizedBox(height: 20),
    ]);

    sections.addAll(_shareSectionWidgets());

    return sections;
  }

  List<Widget> _liveSections(BuildContext context) {
    final tournamentId = detail.tournamentId?.trim() ?? '';
    return [
      MatchDetailLiveScorePanel(detail: detail),
      SizedBox(height: 20),
      if (tournamentId.isNotEmpty && detail.id.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => context.pushNamed(
                AppRouteNames.publicMatchLive,
                pathParameters: {
                  'tournamentId': tournamentId,
                  'matchId': detail.id,
                },
              ),
              icon: const Icon(Icons.live_tv_rounded),
              label: const Text('Compartilhar transmissão ao vivo'),
            ),
          ),
        ),
      if (detail.momentumInfo != null) ...[
        MatchDetailMomentumSection(
          momentum: detail.momentumInfo!,
          isLive: true,
          onViewPlayByPlay: detail.playByPlay.isNotEmpty
              ? () => _openPlayByPlay(context)
              : null,
        ),
        SizedBox(height: 20),
      ],
      ..._playByPlaySection(context),
      ..._shareSectionWidgets(),
    ];
  }

  List<Widget> _scheduledSections(BuildContext context) {
    final sections = <Widget>[
      MatchDetailCountdownCard(detail: detail),
      SizedBox(height: 16),
    ];

    if (detail.isParticipantView && detail.formRows.isNotEmpty) {
      sections.addAll([
        MatchDetailFormSection(rows: detail.formRows),
        SizedBox(height: 20),
      ]);
    }

    if (detail.isParticipantView && detail.headToHead != null) {
      sections.addAll([
        MatchDetailHeadToHeadSection(info: detail.headToHead!),
        SizedBox(height: 20),
      ]);
    }

    sections.add(
      MatchDetailWhereWhenSection(
        detail: detail,
        onViewBracket: () => _onTournament(context),
      ),
    );

    sections.addAll(_shareSectionWidgets());

    return sections;
  }

  List<Widget> _playByPlaySection(BuildContext context) {
    if (detail.playByPlay.isEmpty) return const [];
    return [
      MatchDetailPlayByPlaySection(
        items: detail.playByPlay,
        totalPoints: detail.totalPlayByPlayPoints,
        ourTeamHeader: detail.isParticipantView
            ? 'Sua dupla'
            : detail.ourTeam.label,
        opponentTeamHeader: detail.isParticipantView
            ? 'Adversário'
            : detail.opponentTeam.label,
        playByPlayGroups: detail.playByPlayGroups,
        onViewFullAnalysis: () => _openPlayByPlay(context),
      ),
      SizedBox(height: 20),
    ];
  }

  List<Widget> _shareSectionWidgets() {
    final share = detail.shareInfo;
    if (share == null) return const [];
    return [SizedBox(height: 20), MatchDetailShareSection(share: share)];
  }

  void _openPlayByPlay(BuildContext context) {
    context.pushNamed(
      AppRouteNames.athleteMatchPlayByPlay,
      pathParameters: {'matchId': detail.id},
    );
  }

  void _onTournament(BuildContext context) {
    final id = detail.tournamentId?.trim();
    if (id != null && id.isNotEmpty) {
      context.push(
        AppRoutes.athleteTournamentDetail.replaceFirst(
          ':tournamentId',
          Uri.encodeComponent(id),
        ),
      );
      return;
    }
    showAppSnackBar(context, 'Em breve.');
  }
}
