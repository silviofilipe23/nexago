import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/nexa_async_view.dart';
import 'package:nexago_app/core/ui/nexa_icon_square_button.dart';
import 'package:nexago_app/core/ui/nexa_segmented_control.dart';
import '../../../core/ui/app_status_views.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../domain/double_elimination_bracket_layout.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_match.dart';
import '../domain/tournament_match_card_view_model.dart';
import '../domain/tournament_matches_logic.dart';
import 'widgets/bracket/double_elimination_bracket_canvas.dart';
import 'widgets/tournament_detail/tournament_matches_filter_toggle.dart';
import '../domain/tournament_detail_tabs_logic.dart';
import '../domain/tournament_discovery_providers.dart';
import 'widgets/tournament_detail/tournament_detail_bracket_tab.dart';
import 'widgets/tournament_detail/tournament_detail_groups_tab.dart';
import 'widgets/tournament_match_card.dart';

/// Casca da categoria (paridade com o portal web): o nome da categoria vive
/// na barra do topo, ao lado do voltar; abaixo ficam a meta e o segmentado
/// Partidas/Grupos/Chave — a mesma categoria vista de três ângulos adaptativos.
class TournamentCategoryViewPage extends ConsumerStatefulWidget {
  const TournamentCategoryViewPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  ConsumerState<TournamentCategoryViewPage> createState() =>
      _TournamentCategoryViewPageState();
}

class _TournamentCategoryViewPageState
    extends ConsumerState<TournamentCategoryViewPage> {
  /// Segmento escolhido; `null` = seguir a default (jogos quando existem).
  TournamentCategoryView? _selected;
  late String _categoryId = widget.categoryId;
  TournamentMatchesFilter _filter = TournamentMatchesFilter.all;

  /// Fase selecionada nos chips da Chave (`null` = tudo).
  String? _bracketRound;

  /// Partidas com os mesmos filtros da lista da Chave: Todas/Minhas +
  /// chips de fase (Grupos e rodadas do mata-mata).
  Widget _buildMatchesView({
    required List<TournamentMatchCardViewModel> categoryCards,
    required List<TournamentMatch> allMatches,
    required Set<String> athleteTeamIds,
    required bool isRegistered,
  }) {
    final pool = poolMatchesForCategory(allMatches, _categoryId);
    final bracket = bracketMatchesForCategory(allMatches, _categoryId);
    final knockoutGroups = groupBracketMatchesByRound(bracket);
    final roundLabels = [for (final g in knockoutGroups) g.roundLabel];
    final showGroupsChip = pool.isNotEmpty;
    const groupsKey = TournamentDetailBracketTab.groupsRoundKey;
    final round = _bracketRound != null &&
            (_bracketRound == groupsKey && showGroupsChip ||
                roundLabels.contains(_bracketRound))
        ? _bracketRound
        : null;

    final allowedIds = <String>{
      if (round == null)
        for (final c in categoryCards) c.match.id
      else if (round == groupsKey)
        for (final m in pool) m.id
      else
        for (final g in knockoutGroups)
          if (g.roundLabel == round)
            for (final m in g.matches) m.id,
    };
    var cards = [
      for (final c in categoryCards)
        if (allowedIds.contains(c.match.id)) c,
    ];
    if (_filter == TournamentMatchesFilter.mine) {
      cards = [
        for (final c in cards)
          if (athleteTeamIds.contains(c.match.teamAId) ||
              athleteTeamIds.contains(c.match.teamBId))
            c,
      ];
    }

    return _MatchesView(
      cards: cards,
      onMatchTap: _openMatchDetail,
      header: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (isRegistered)
            TournamentMatchesFilterToggle(
              value: _filter,
              onChanged: (f) => setState(() => _filter = f),
            ),
          if (showGroupsChip || roundLabels.length > 1)
            BracketPhaseChips(
              showGroups: showGroupsChip,
              roundLabels: roundLabels,
              selected: round,
              onChanged: (r) => setState(() => _bracketRound = r),
            ),
        ],
      ),
    );
  }

  void _openMatchDetail(String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return;
    context.pushNamed(
      AppRouteNames.athleteMatchDetail,
      pathParameters: {'matchId': id},
      queryParameters: {AppRoutes.matchDetailFromTournamentQuery: '1'},
    );
  }

  @override
  Widget build(BuildContext context) {
    final tournamentAsync =
        ref.watch(tournamentDetailProvider(widget.tournamentId));
    final colors = context.themeColors;
    final topInset = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaAsyncView<TournamentDetail?>(
        value: tournamentAsync,
        onRetry: () =>
            ref.invalidate(tournamentDetailProvider(widget.tournamentId)),
        skeleton: const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        emptyWhen: (t) =>
            t == null || !t.categoryOffers.any((o) => o.id == _categoryId),
        empty: AppEmptyView(
          icon: Icons.grid_view_rounded,
          title: 'Categoria não encontrada',
          subtitle: 'A categoria pode ter sido removida do torneio.',
          actionLabel: 'Voltar',
          onAction: () => context.pop(),
        ),
        data: (value) {
          final tournament = value!;
          final offer =
              tournament.categoryOffers.firstWhere((o) => o.id == _categoryId);

          final matches = ref
                  .watch(tournamentMatchCardsProvider(tournament.id))
                  .valueOrNull ??
              const [];
          final categoryCards = matches
              .where((c) => c.match.categoryId == _categoryId)
              .toList();
          final allMatches = [for (final c in matches) c.match];
          final cardsById = {for (final c in matches) c.match.id: c};
          final teamIdsByCategory = ref
                  .watch(
                    tournamentUserTeamIdsByCategoryProvider(tournament.id),
                  )
                  .valueOrNull ??
              const <String, String>{};
          final athleteTeamIds =
              athleteTeamIdsForHighlight(teamIdsByCategory);
          final registrations = ref
                  .watch(
                    tournamentUserRegistrationsByCategoryProvider(
                      tournament.id,
                    ),
                  )
                  .valueOrNull ??
              const <String, UserCategoryRegistration>{};
          final isRegistered =
              athleteTeamIds.isNotEmpty || registrations.isNotEmpty;
          final bracketMatches =
              bracketMatchesForCategory(allMatches, _categoryId);
          final views = visibleCategoryViews(
            hasMatches: categoryCards.isNotEmpty,
            hasGroups: categoryCards.any((c) => c.match.isGroupMatch),
          );
          final selected = _selected != null && views.contains(_selected)
              ? _selected!
              : defaultCategoryView(views);

          final metaParts = [
            offer.formatLabel,
            if (offer.level.trim().isNotEmpty) offer.level,
            '${offer.maxTeams > 0 ? offer.maxTeams : offer.spotsTotal} '
                '${offer.unitLabel}',
          ];

          return Column(
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
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        offer.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.titleM
                            .copyWith(color: colors.onSurface),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.xs),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.sm,
                  AppSpacing.screenH,
                  AppSpacing.md,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      metaParts.join(' · ').toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.monoMeta
                          .copyWith(color: colors.onSurfaceMuted),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    NexaSegmentedControl<TournamentCategoryView>(
                      segments: [
                        for (final view in views)
                          NexaSegment(value: view, label: view.label),
                      ],
                      selected: selected,
                      onChanged: (view) =>
                          setState(() => _selected = view),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: switch (selected) {
                  TournamentCategoryView.partidas => _buildMatchesView(
                      categoryCards: categoryCards,
                      allMatches: allMatches,
                      athleteTeamIds: athleteTeamIds,
                      isRegistered: isRegistered,
                    ),
                  TournamentCategoryView.grupos => TournamentDetailGroupsTab(
                      tournament: tournament,
                      categoryId: _categoryId,
                      filter: _filter,
                      showCategoryChips: false,
                      onCategorySelected: (id) =>
                          setState(() => _categoryId = id),
                      onFilterChanged: (f) => setState(() => _filter = f),
                    ),
                  // Chave = bracket navegável: canvas com chips de fase e
                  // arrasto livre (a lista com filtros vive em Partidas).
                  TournamentCategoryView.chave => bracketMatches.isEmpty
                      ? Padding(
                          padding: const EdgeInsets.all(AppSpacing.xxl),
                          child: Text(
                            'A chave aparece aqui assim que o organizador '
                            'sortear o mata-mata.',
                            textAlign: TextAlign.center,
                            style: AppTypography.bodyM
                                .copyWith(color: colors.onSurfaceMuted),
                          ),
                        )
                      : DoubleEliminationBracketCanvas(
                          layout: buildDoubleEliminationBracketLayout(
                            bracketMatches,
                          ),
                          cardsById: cardsById,
                          athleteTeamIds: athleteTeamIds,
                          onMatchTap: _openMatchDetail,
                        ),
                },
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Visão "Partidas": os jogos da categoria em ordem cronológica, com o
/// toggle Todas/Minhas do app.
class _MatchesView extends ConsumerWidget {
  const _MatchesView({
    required this.cards,
    required this.onMatchTap,
    this.header,
  });

  final List<TournamentMatchCardViewModel> cards;
  final ValueChanged<String> onMatchTap;

  /// Filtros (Todas/Minhas + chips de fase) — rolam junto com a lista.
  final Widget? header;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final sorted = [...cards]..sort((a, b) {
        final at = a.match.scheduleTime;
        final bt = b.match.scheduleTime;
        if (at == null && bt == null) {
          return a.match.matchNumber.compareTo(b.match.matchNumber);
        }
        if (at == null) return 1;
        if (bt == null) return -1;
        return at.compareTo(bt);
      });

    if (sorted.isEmpty) {
      return ListView(
        children: [
          if (header != null) header!,
          Padding(
            padding: const EdgeInsets.all(AppSpacing.xxl),
            child: Text(
              'As partidas aparecem aqui quando o organizador publicar os '
              'jogos.',
              textAlign: TextAlign.center,
              style:
                  AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
            ),
          ),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.only(top: AppSpacing.xs, bottom: AppSpacing.xxl),
      children: [
        if (header != null) header!,
        for (final card in sorted)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              0,
              AppSpacing.screenH,
              AppSpacing.sm + 2,
            ),
            child: TournamentMatchCard(
              viewModel: card,
              onTap: () => onMatchTap(card.match.id),
            ),
          ),
      ],
    );
  }
}
