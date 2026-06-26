import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'tabs/organizer_tournament_financial_tab.dart';
import 'widgets/organizer_tournament_subpage_scaffold.dart';

class OrganizerTournamentFinancialPage extends ConsumerWidget {
  const OrganizerTournamentFinancialPage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(organizerTournamentDetailProvider(tournamentId));

    return detailAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(body: Center(child: Text('Erro: $e'))),
      data: (state) {
        if (state.summary == null) {
          return const Scaffold(
            body: Center(child: Text('Torneio não encontrado')),
          );
        }
        return OrganizerTournamentSubpageScaffold(
          title: 'Financeiro',
          trailing: Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () {},
              borderRadius: BorderRadius.circular(12),
              child: const SizedBox(
                width: 44,
                height: 44,
                child: Icon(Icons.description_outlined, size: 22),
              ),
            ),
          ),
          slivers: [
            SliverFillRemaining(
              hasScrollBody: true,
              child: OrganizerTournamentFinancialTab(
                summary: state.summary!,
                categories: state.categories,
              ),
            ),
          ],
        );
      },
    );
  }
}
