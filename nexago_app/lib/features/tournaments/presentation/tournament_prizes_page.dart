import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/theme/app_colors.dart';
import '../domain/tournament_discovery_providers.dart';
import 'widgets/tournament_detail/tournament_detail_prizes_tab.dart';
import 'widgets/tournament_detail/tournament_detail_subpage_scaffold.dart';

class TournamentPrizesPage extends ConsumerWidget {
  const TournamentPrizesPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tournamentAsync = ref.watch(tournamentDetailProvider(tournamentId));

    return tournamentAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.brand)),
      ),
      error: (e, _) => TournamentDetailSubpageScaffold(
        title: 'Premiações',
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Não foi possível carregar a premiação.\n$e'),
            ),
          ),
        ],
      ),
      data: (tournament) {
        if (tournament == null) {
          return const TournamentDetailSubpageScaffold(
            title: 'Premiações',
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

        return TournamentDetailSubpageScaffold(
          title: 'Premiações',
          slivers: TournamentDetailPrizesTab(
            tournament: tournament,
          ).buildSlivers(context),
        );
      },
    );
  }
}
