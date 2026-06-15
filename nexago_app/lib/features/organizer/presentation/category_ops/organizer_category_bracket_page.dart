import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../tournaments/presentation/double_elimination_bracket_page.dart';
import '../../../tournaments/domain/tournament_discovery_providers.dart';

class OrganizerCategoryBracketPage extends ConsumerWidget {
  const OrganizerCategoryBracketPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    this.initialTab = 'winners',
  });

  final String tournamentId;
  final String categoryId;
  final String initialTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (initialTab == 'matches') {
      final cardsAsync = ref.watch(tournamentMatchCardsProvider(tournamentId));
      return Scaffold(
        appBar: AppBar(title: const Text('Jogos')),
        body: cardsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (cards) {
            final filtered = cards
                .where((c) => c.match.categoryId == categoryId)
                .toList();
            if (filtered.isEmpty) {
              return const Center(child: Text('Nenhum jogo publicado ainda.'));
            }
            return ListView.builder(
              itemCount: filtered.length,
              itemBuilder: (context, index) {
                final card = filtered[index];
                return ListTile(
                  title: Text(card.match.teamsLabel),
                  subtitle: Text(card.match.scoreLabel),
                );
              },
            );
          },
        ),
      );
    }

    return DoubleEliminationBracketPage(
      tournamentId: tournamentId,
      categoryId: categoryId,
    );
  }
}
