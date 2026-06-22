import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/theme/app_colors.dart';
import '../domain/tournament_discovery_providers.dart';
import 'widgets/tournament_detail/tournament_detail_groups_tab.dart';
import 'widgets/tournament_detail/tournament_detail_subpage_scaffold.dart';
import 'widgets/tournament_detail/tournament_matches_filter_toggle.dart';

class TournamentGroupsPage extends ConsumerStatefulWidget {
  const TournamentGroupsPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  ConsumerState<TournamentGroupsPage> createState() =>
      _TournamentGroupsPageState();
}

class _TournamentGroupsPageState extends ConsumerState<TournamentGroupsPage> {
  String? _categoryId;
  TournamentMatchesFilter _filter = TournamentMatchesFilter.all;

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
        title: 'Grupos',
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Não foi possível carregar os grupos.\n$e'),
            ),
          ),
        ],
      ),
      data: (tournament) {
        if (tournament == null) {
          return const TournamentDetailSubpageScaffold(
            title: 'Grupos',
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

        final categoryId = _categoryId ??
            tournament.categoryOffers.firstOrNull?.id ??
            '';

        return TournamentDetailSubpageScaffold(
          title: 'Grupos',
          slivers: TournamentDetailGroupsTab(
            tournament: tournament,
            categoryId: categoryId,
            filter: _filter,
            onCategorySelected: (id) => setState(() => _categoryId = id),
            onFilterChanged: (filter) => setState(() => _filter = filter),
          ).buildSlivers(context, ref),
        );
      },
    );
  }
}
