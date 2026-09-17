import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../auth/widgets/auth_form_widgets.dart';
import '../../tournaments/domain/tournament_match.dart';
import '../data/match_history/head_to_head_repository.dart';
import '../domain/match_history/athlete_match_detail_models.dart';
import '../domain/match_history/athlete_match_detail_providers.dart';
import 'widgets/match_detail/match_detail_countdown_card.dart';
import 'widgets/match_detail/match_detail_footer.dart';
import 'widgets/match_detail/match_detail_form_section.dart';
import 'widgets/match_detail/match_detail_head_to_head_section.dart';
import 'widgets/match_detail/match_detail_hero_card.dart';
import 'widgets/match_detail/match_detail_individual_head_to_head_section.dart';
import 'widgets/match_detail/match_detail_live_actions.dart';
import 'widgets/match_detail/match_detail_momentum_section.dart';
import 'widgets/match_detail/match_detail_play_by_play_section.dart';
import 'widgets/match_detail/match_detail_point_by_point_section.dart';
import 'widgets/match_detail/match_detail_set_timeline_section.dart';
import 'widgets/match_detail/match_detail_share_section.dart';
import 'widgets/match_detail/match_detail_where_when_section.dart';
import 'widgets/match_detail/match_detail_win_probability_section.dart';
import 'widgets/match_detail/match_detail_xp_card.dart';

/// Arte de fundo das telas de detalhe da partida — cobre a tela inteira.
const kMatchDetailLiveBackgroundAsset =
    'assets/images/sports/match_detail_live_bg.webp';

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

    return detailAsync.when(
      loading: () => Scaffold(
        backgroundColor: AppColors.canvas,
        appBar: _appBar(context, theme, null),
        body: Center(child: CircularProgressIndicator(color: AppColors.brand)),
      ),
      error: (error, stackTrace) => Scaffold(
        backgroundColor: AppColors.canvas,
        appBar: _appBar(context, theme, null),
        body: _messageBody(
          theme,
          'Não foi possível carregar os detalhes da partida.',
        ),
      ),
      data: (detail) {
        if (detail == null) {
          return Scaffold(
            backgroundColor: AppColors.canvas,
            appBar: _appBar(context, theme, null),
            body: _messageBody(theme, 'Partida não encontrada.'),
          );
        }

        final individualH2hs = _watchIndividualHeadToHeads(ref, detail);
        return Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            fit: StackFit.expand,
            children: [
              const _MatchDetailFullBleedBackground(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _MatchDetailCompactAppBar(detail: detail, theme: theme),
                  Expanded(
                    child: _MatchDetailTabbedBody(
                      detail: detail,
                      hideTournamentAction: hideTournamentAction,
                      individualHeadToHeads: individualH2hs,
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  PreferredSizeWidget _appBar(
    BuildContext context,
    ThemeData theme,
    AthleteMatchDetail? detail,
  ) {
    final top = MediaQuery.paddingOf(context).top;
    return PreferredSize(
      preferredSize: Size.fromHeight(top + _MatchDetailCompactAppBar.rowHeight),
      child: _MatchDetailCompactAppBar(detail: detail, theme: theme),
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

/// H2H individual (por atleta) de cada adversário da partida.
///
/// Resolvido à parte do detalhe — se a callable falhar ou demorar, só essa
/// seção some, sem afetar o restante da tela.
///
/// Um bloco por adversário distinto (`athleteId`). Históricos iguais NÃO são
/// mesclados: cada atleta pode ter outras equipes/parceiros e o placar H2H é
/// sempre atleta × atleta.
List<({String opponentName, HeadToHeadRecord record})>
    _watchIndividualHeadToHeads(WidgetRef ref, AthleteMatchDetail detail) {
  if (!detail.isParticipantView) return const [];

  final myAthleteId = (ref.watch(authProvider).valueOrNull?.uid ?? '').trim();
  if (myAthleteId.isEmpty) return const [];

  final out = <({String opponentName, HeadToHeadRecord record})>[];
  final seenIds = <String>{};

  for (final player in detail.opponentTeam.players) {
    final opponentId = (player.athleteId ?? '').trim();
    if (opponentId.isEmpty || opponentId == myAthleteId) continue;
    if (!seenIds.add(opponentId)) continue;

    final record = ref
        .watch(
          headToHeadRecordProvider(
            HeadToHeadQuery(
              athleteIdA: myAthleteId,
              athleteIdB: opponentId,
            ),
          ),
        )
        .valueOrNull;
    if (record == null || !record.hasHistory) continue;

    final name = (player.name ?? '').trim();
    out.add((
      opponentName: name.isEmpty ? player.initials : name,
      record: record,
    ));
  }

  return out;
}

class _MatchDetailTabbedBody extends ConsumerStatefulWidget {
  const _MatchDetailTabbedBody({
    required this.detail,
    required this.hideTournamentAction,
    this.individualHeadToHeads = const [],
  });

  final AthleteMatchDetail detail;
  final bool hideTournamentAction;
  final List<({String opponentName, HeadToHeadRecord record})>
      individualHeadToHeads;

  @override
  ConsumerState<_MatchDetailTabbedBody> createState() =>
      _MatchDetailTabbedBodyState();
}

enum _MatchDetailTab { placar, estatisticas, historico }

class _MatchDetailTabbedBodyState extends ConsumerState<_MatchDetailTabbedBody> {
  _MatchDetailTab _tab = _MatchDetailTab.placar;

  AthleteMatchDetail get detail => widget.detail;

  @override
  Widget build(BuildContext context) {
    final match = ref
        .watch(matchDetailTournamentMatchProvider(detail.id))
        .valueOrNull;

    return ListView(
      padding: EdgeInsets.fromLTRB(
        10,
        8,
        20,
        10 + MediaQuery.paddingOf(context).bottom,
      ),
      children: [
        MatchDetailHeroCard(detail: detail),
        const SizedBox(height: 12),
        _MatchDetailTabs(
          selected: _tab,
          onSelected: (tab) => setState(() => _tab = tab),
        ),
        const SizedBox(height: 12),
        ..._tabContent(match),
        if (!widget.hideTournamentAction) ...[
          const SizedBox(height: 20),
          MatchDetailFooter(
            kind: _footerKind,
            hideTournamentAction: false,
            onTournament: _onTournament,
            onRematch: () => showAppSnackBar(context, 'Em breve.'),
            onOpponentProfile: () => showAppSnackBar(context, 'Em breve.'),
          ),
        ],
        const SizedBox(height: 28),
        const _BrandFooter(),
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

  List<Widget> _tabContent(TournamentMatch? match) {
    return switch (_tab) {
      _MatchDetailTab.placar => _placarSections(match),
      _MatchDetailTab.estatisticas => _statsSections(),
      _MatchDetailTab.historico => _historySections(),
    };
  }

  List<Widget> _placarSections(TournamentMatch? match) {
    return switch (detail.phase) {
      MatchDetailPhase.live => [
        MatchDetailLiveStatusCard(
          detail: detail,
          matchStartedAt: match?.matchStartedAt,
          liveElapsedSec: match?.liveElapsedSec ?? 0,
        ),
        const SizedBox(height: 12),
        MatchDetailLiveActionsRow(detail: detail),
      ],
      MatchDetailPhase.scheduled => [
        MatchDetailCountdownCard(detail: detail),
        const SizedBox(height: 12),
        MatchDetailLiveActionsRow(detail: detail),
      ],
      MatchDetailPhase.completed => [
        if (detail.isParticipantView && detail.xpInfo != null) ...[
          MatchDetailXpCard(xp: detail.xpInfo!),
          const SizedBox(height: 12),
        ],
        // Encerrada: só compartilhar (seguir não faz sentido).
        MatchDetailLiveActionsRow(detail: detail, showFollow: false),
      ],
      MatchDetailPhase.canceled => [
        Text(
          'Esta partida foi cancelada.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            color: AppColors.onSurfaceMuted,
          ),
        ),
      ],
    };
  }

  List<Widget> _statsSections() {
    final ourHeader = detail.isParticipantView
        ? 'Sua dupla'
        : detail.ourTeam.label;
    final oppHeader = detail.isParticipantView
        ? 'Adversário'
        : detail.opponentTeam.label;
    final sections = <Widget>[];

    if (detail.phase == MatchDetailPhase.scheduled) {
      sections.add(MatchDetailWinProbabilitySection(detail: detail));
      if (detail.isParticipantView && detail.formRows.isNotEmpty) {
        sections.addAll([
          const SizedBox(height: 20),
          MatchDetailFormSection(rows: detail.formRows),
        ]);
      }
      return sections.isEmpty
          ? [
              Text(
                'Estatísticas pré-jogo em breve.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.onSurfaceMuted,
                ),
              ),
            ]
          : sections;
    }

    if (detail.momentumInfo != null) {
      sections.addAll([
        MatchDetailMomentumSection(
          momentum: detail.momentumInfo!,
          isLive: detail.phase == MatchDetailPhase.live,
          onViewPlayByPlay: detail.playByPlay.isNotEmpty
              ? _openPlayByPlay
              : null,
        ),
        const SizedBox(height: 20),
      ]);
    }

    if (detail.playByPlay.isNotEmpty) {
      sections.addAll([
        MatchDetailPlayByPlaySection(
          items: detail.playByPlay,
          totalPoints: detail.totalPlayByPlayPoints,
          ourTeamHeader: ourHeader,
          opponentTeamHeader: oppHeader,
          playByPlayGroups: detail.playByPlayGroups,
          onViewFullAnalysis: detail.playByPlayGroups.isEmpty
              ? _openPlayByPlay
              : null,
        ),
        const SizedBox(height: 20),
      ]);
    }

    if (detail.playByPlayGroups.isNotEmpty) {
      sections.add(
        MatchDetailPointByPointSection(
          groups: detail.playByPlayGroups,
          ourTeamHeader: ourHeader,
          opponentTeamHeader: oppHeader,
          onViewFullAnalysis: _openPlayByPlay,
        ),
      );
    }

    if (sections.isEmpty) {
      return [
        Text(
          detail.phase == MatchDetailPhase.canceled
              ? 'Sem estatísticas para partida cancelada.'
              : 'Estatísticas em breve quando houver pontos registrados.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: AppColors.onSurfaceMuted,
          ),
        ),
      ];
    }

    return sections;
  }

  List<Widget> _historySections() {
    final sections = <Widget>[];

    if (detail.setTimelineItems.isNotEmpty) {
      sections.addAll([
        MatchDetailSetTimelineSection(items: detail.setTimelineItems),
        const SizedBox(height: 20),
      ]);
    }

    if (detail.isParticipantView && detail.headToHead != null) {
      sections.addAll([
        MatchDetailHeadToHeadSection(info: detail.headToHead!),
        const SizedBox(height: 20),
      ]);
    }

    if (widget.individualHeadToHeads.isNotEmpty) {
      sections.addAll([
        MatchDetailIndividualHeadToHeadSection(
          entries: [
            for (final entry in widget.individualHeadToHeads)
              IndividualHeadToHeadEntry(
                opponentName: entry.opponentName,
                record: entry.record,
              ),
          ],
        ),
        const SizedBox(height: 20),
      ]);
    }

    sections.add(MatchDetailWhereWhenSection(detail: detail));

    final poster = detail.sharePoster;
    if (poster != null && detail.phase != MatchDetailPhase.live) {
      sections.addAll([
        const SizedBox(height: 20),
        MatchDetailShareSection(poster: poster),
      ]);
    }

    if (sections.isEmpty) {
      return [
        Text(
          'Histórico do confronto em breve.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: AppColors.onSurfaceMuted,
          ),
        ),
      ];
    }

    return sections;
  }

  void _openPlayByPlay() {
    context.pushNamed(
      AppRouteNames.athleteMatchPlayByPlay,
      pathParameters: {'matchId': detail.id},
    );
  }

  void _onTournament() {
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

class _MatchDetailTabs extends StatelessWidget {
  const _MatchDetailTabs({required this.selected, required this.onSelected});

  final _MatchDetailTab selected;
  final ValueChanged<_MatchDetailTab> onSelected;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final tab in _MatchDetailTab.values) ...[
          if (tab != _MatchDetailTab.values.first) const SizedBox(width: 8),
          Expanded(
            child: _TabChip(
              label: switch (tab) {
                _MatchDetailTab.placar => 'Placar',
                _MatchDetailTab.estatisticas => 'Estatísticas',
                _MatchDetailTab.historico => 'Histórico',
              },
              selected: selected == tab,
              onTap: () => onSelected(tab),
            ),
          ),
        ],
      ],
    );
  }
}

class _TabChip extends StatelessWidget {
  const _TabChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: selected
                    ? AppColors.onSurface
                    : AppColors.onSurfaceMuted,
              ),
            ),
          ),
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            height: 2,
            width: double.infinity,
            color: selected ? AppColors.brand : Colors.transparent,
          ),
        ],
      ),
    );
  }
}

class _MatchDetailCompactAppBar extends StatelessWidget {
  const _MatchDetailCompactAppBar({required this.detail, required this.theme});

  final AthleteMatchDetail? detail;
  final ThemeData theme;

  static const rowHeight = 44.0;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    const chipColor = Color(0x59000000); // black 35%

    // Transparente: a arte full-bleed do Stack aparece até o topo.
    // O header fica fora do ListView, então o conteúdo não passa por trás.
    return Padding(
      padding: EdgeInsets.only(top: top),
      child: SizedBox(
        height: rowHeight,
        child: Row(
          children: [
            const SizedBox(width: 12),
            _NavChip(
              color: chipColor,
              onTap: () => context.pop(),
              child: const Icon(
                Icons.chevron_left_rounded,
                color: AppColors.onSurface,
              ),
            ),
            Expanded(
              child: Text(
                'Detalhes da partida',
                textAlign: TextAlign.center,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                  letterSpacing: -0.3,
                ),
              ),
            ),
            _NavChip(
              color: chipColor,
              onTap: () {
                final share = detail?.sharePoster;
                if (share != null) {
                  showMatchDetailShareSheet(context, share);
                } else {
                  showAppSnackBar(context, 'Em breve.');
                }
              },
              child: const Icon(
                Icons.ios_share_rounded,
                color: AppColors.onSurface,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
          ],
        ),
      ),
    );
  }
}

class _NavChip extends StatelessWidget {
  const _NavChip({
    required this.color,
    required this.onTap,
    required this.child,
  });

  final Color color;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(width: 40, height: 40, child: Center(child: child)),
      ),
    );
  }
}

class _MatchDetailFullBleedBackground extends StatelessWidget {
  const _MatchDetailFullBleedBackground();

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(
          kMatchDetailLiveBackgroundAsset,
          fit: BoxFit.cover,
          alignment: Alignment.center,
          errorBuilder: (_, __, ___) => const ColoredBox(color: Colors.black),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.55),
                Colors.black.withValues(alpha: 0.48),
                Colors.black.withValues(alpha: 0.62),
                const Color(0xFF050505),
              ],
              stops: const [0, 0.22, 0.68, 1],
            ),
          ),
        ),
      ],
    );
  }
}

class _BrandFooter extends StatelessWidget {
  const _BrandFooter();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Image.asset(
          kNexagoLogoAsset,
          height: 22,
          errorBuilder: (_, __, ___) => Text(
            'nexaGO',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w900,
              color: AppColors.brand,
            ),
          ),
        ),
        const Spacer(),
        Text(
          'VAMOS NEXA',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.onSurfaceMuted,
            letterSpacing: 1.6,
          ),
        ),
      ],
    );
  }
}

