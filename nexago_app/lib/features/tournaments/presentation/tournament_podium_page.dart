import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/theme/app_colors.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_podium_logic.dart';
import 'widgets/tournament_detail/tournament_detail_podium_tab.dart';
import 'widgets/tournament_detail/tournament_detail_subpage_scaffold.dart';

/// Pódio do torneio — uma categoria por vez, do campeão ao terceiro lugar.
///
/// Os dados vêm das partidas (`winnerId` das finais), a mesma fonte que a
/// Cloud Function usa para o ranking, e não de `tournamentCategoryResults`:
/// os cards de partida já estão no stream do detalhe e trazem nome e foto de
/// cada atleta junto, sem nenhuma leitura extra.
class TournamentPodiumPage extends ConsumerStatefulWidget {
  const TournamentPodiumPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  ConsumerState<TournamentPodiumPage> createState() =>
      _TournamentPodiumPageState();
}

class _TournamentPodiumPageState extends ConsumerState<TournamentPodiumPage> {
  static const _title = 'Pódio';

  /// `null` enquanto o atleta não escolheu — aí vale a categoria de entrada
  /// calculada dos dados, que só existe depois que as partidas chegam.
  String? _pickedCategoryId;

  @override
  Widget build(BuildContext context) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );
    final cardsAsync = ref.watch(
      tournamentMatchCardsProvider(widget.tournamentId),
    );
    final counts =
        ref
            .watch(
              tournamentCategoryEnrollmentCountsProvider(widget.tournamentId),
            )
            .valueOrNull ??
        const <String, int>{};

    return tournamentAsync.when(
      loading: () => const _PodiumLoading(),
      error: (e, _) => const TournamentDetailSubpageScaffold(
        title: _title,
        slivers: [_MessageSliver('Não foi possível carregar o pódio.')],
      ),
      data: (tournament) {
        if (tournament == null) {
          return const TournamentDetailSubpageScaffold(
            title: _title,
            slivers: [_MessageSliver('Torneio não encontrado.')],
          );
        }

        // Enquanto as partidas não chegam, a tela não pode afirmar que não há
        // pódio: mostraria "pódio não definido" em categoria já decidida.
        if (cardsAsync.isLoading) return const _PodiumLoading();

        final podiums = tournamentPodiumsByCategory(
          categories: tournament.categoryOffers,
          cards: cardsAsync.valueOrNull ?? const [],
        );

        return TournamentDetailSubpageScaffold(
          title: _title,
          slivers: TournamentDetailPodiumTab(
            podiums: podiums,
            selectedCategoryId:
                _pickedCategoryId ?? defaultPodiumCategoryId(podiums),
            onSelectCategory: (id) => setState(() => _pickedCategoryId = id),
            teamCountByCategoryId: counts,
          ).buildSlivers(),
        );
      },
    );
  }
}

class _PodiumLoading extends StatelessWidget {
  const _PodiumLoading();

  @override
  Widget build(BuildContext context) {
    return const TournamentDetailSubpageScaffold(
      title: 'Pódio',
      slivers: [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
        ),
      ],
    );
  }
}

class _MessageSliver extends StatelessWidget {
  const _MessageSliver(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(message),
      ),
    );
  }
}
