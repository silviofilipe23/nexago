import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/theme/app_colors.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_podium_logic.dart';
import 'widgets/tournament_detail/tournament_detail_podium_tab.dart';
import 'widgets/tournament_detail/tournament_detail_subpage_scaffold.dart';

/// Pódio do torneio — um bloco por categoria, do campeão ao terceiro lugar.
///
/// Os dados vêm das partidas (`winnerId` das finais), a mesma fonte que a
/// Cloud Function usa para o ranking, e não de `tournamentCategoryResults`:
/// as partidas já estão no stream do detalhe e trazem o nome das duplas
/// junto, sem nenhuma leitura extra.
class TournamentPodiumPage extends ConsumerWidget {
  const TournamentPodiumPage({super.key, required this.tournamentId});

  final String tournamentId;

  static const _title = 'Pódio';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tournamentAsync = ref.watch(tournamentDetailProvider(tournamentId));
    final matchesAsync = ref.watch(tournamentMatchCardsProvider(tournamentId));

    return tournamentAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.brand)),
      ),
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
        if (matchesAsync.isLoading) {
          return const TournamentDetailSubpageScaffold(
            title: _title,
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

        final matches =
            matchesAsync.valueOrNull?.map((c) => c.match).toList() ?? const [];

        return TournamentDetailSubpageScaffold(
          title: _title,
          slivers: TournamentDetailPodiumTab(
            podiums: tournamentPodiumsByCategory(
              categories: tournament.categoryOffers,
              matches: matches,
            ),
          ).buildSlivers(),
        );
      },
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
