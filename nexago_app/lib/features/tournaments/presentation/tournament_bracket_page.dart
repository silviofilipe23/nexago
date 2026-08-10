import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../domain/tournament_discovery_providers.dart';
import 'widgets/tournament_detail/tournament_detail_bracket_tab.dart';
import 'widgets/tournament_detail/tournament_detail_subpage_scaffold.dart';
import 'widgets/tournament_detail/tournament_matches_filter_toggle.dart';

class TournamentBracketPage extends ConsumerStatefulWidget {
  const TournamentBracketPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  ConsumerState<TournamentBracketPage> createState() =>
      _TournamentBracketPageState();
}

class _TournamentBracketPageState extends ConsumerState<TournamentBracketPage> {
  String? _categoryId;
  TournamentMatchesFilter _filter = TournamentMatchesFilter.all;
  bool _initializedCategoryFromRoute = false;

  /// Fase selecionada nos chips da Chave (`null` = tudo).
  String? _round;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initializedCategoryFromRoute) return;
    _initializedCategoryFromRoute = true;
    final fromRoute =
        GoRouterState.of(context).uri.queryParameters['categoryId']?.trim();
    if (fromRoute != null && fromRoute.isNotEmpty) {
      _categoryId = fromRoute;
    }
  }

  @override
  Widget build(BuildContext context) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );

    return tournamentAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.brand)),
      ),
      error: (e, _) => TournamentDetailSubpageScaffold(
        title: 'Chave e Jogos',
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Não foi possível carregar a chave.\n$e'),
            ),
          ),
        ],
      ),
      data: (tournament) {
        if (tournament == null) {
          return const TournamentDetailSubpageScaffold(
            title: 'Chave',
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Torneio não encontrado.'),
                ),
              ),
            ],
          );
        }

        final offers = tournament.categoryOffers;
        final resolvedCategoryId = _categoryId?.trim();
        final categoryId = offers.any((offer) => offer.id == resolvedCategoryId)
            ? resolvedCategoryId!
            : (offers.firstOrNull?.id ?? '');

        return TournamentDetailSubpageScaffold(
          title: 'Chave e Jogos',
          actions: [
            _PredictionsButton(tournamentId: widget.tournamentId),
          ],
          slivers: TournamentDetailBracketTab(
            tournament: tournament,
            categoryId: categoryId,
            filter: _filter,
            selectedRound: _round,
            onRoundChanged: (round) => setState(() => _round = round),
            onCategorySelected: (id) => setState(() {
              _categoryId = id;
              _round = null;
            }),
            onFilterChanged: (filter) => setState(() => _filter = filter),
          ).buildSlivers(context, ref),
        );
      },
    );
  }
}

/// Atalho no app bar da chave pra tela "Palpites" (feature #5 — torcida
/// palpita quem vence cada partida agendada e o campeão).
class _PredictionsButton extends StatelessWidget {
  const _PredictionsButton({required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () => context.pushNamed(
          AppRouteNames.tournamentPredictions,
          pathParameters: {'tournamentId': tournamentId},
        ),
        borderRadius: BorderRadius.circular(12),
        child: const SizedBox(
          width: 44,
          height: 44,
          child: Icon(Icons.emoji_events_outlined, size: 22),
        ),
      ),
    );
  }
}
