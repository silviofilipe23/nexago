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
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_match_card_view_model.dart';
import '../domain/tournament_detail_tabs_logic.dart';
import '../domain/tournament_discovery_providers.dart';
import 'widgets/tournament_detail/tournament_detail_bracket_tab.dart';
import 'widgets/tournament_detail/tournament_detail_groups_tab.dart';
import 'widgets/tournament_detail/tournament_matches_filter_toggle.dart';
import 'widgets/tournament_match_card.dart';

/// Casca da categoria (paridade com o portal web): "Todas as categorias" pra
/// voltar, nome + meta, e o segmentado Partidas/Grupos/Chave — a mesma
/// categoria vista de três ângulos adaptativos.
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
                    Text(
                      'Todas as categorias',
                      style: AppTypography.labelS
                          .copyWith(color: colors.onSurfaceMuted),
                    ),
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
                      offer.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.titleL
                          .copyWith(color: colors.onSurface),
                    ),
                    const SizedBox(height: 3),
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
                  TournamentCategoryView.partidas => _MatchesView(
                      cards: categoryCards,
                      onMatchTap: _openMatchDetail,
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
                  TournamentCategoryView.chave => TournamentDetailBracketTab(
                      tournament: tournament,
                      categoryId: _categoryId,
                      filter: _filter,
                      showCategoryChips: false,
                      selectedRound: _bracketRound,
                      onRoundChanged: (round) =>
                          setState(() => _bracketRound = round),
                      onCategorySelected: (id) =>
                          setState(() => _categoryId = id),
                      onFilterChanged: (f) => setState(() => _filter = f),
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
  const _MatchesView({required this.cards, required this.onMatchTap});

  final List<TournamentMatchCardViewModel> cards;
  final ValueChanged<String> onMatchTap;

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
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Text(
          'As partidas aparecem aqui quando o organizador publicar os jogos.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.xs,
        AppSpacing.screenH,
        AppSpacing.xxl,
      ),
      children: [
        for (final card in sorted)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm + 2),
            child: TournamentMatchCard(
              viewModel: card,
              onTap: () => onMatchTap(card.match.id),
            ),
          ),
      ],
    );
  }
}
