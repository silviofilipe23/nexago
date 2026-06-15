import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../match_ops/organizer_match_center_page.dart';
import '../../../tournaments/presentation/double_elimination_bracket_page.dart';

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
      return OrganizerMatchCenterPage(
        tournamentId: tournamentId,
        initialCategoryId: categoryId,
      );
    }

    return DoubleEliminationBracketPage(
      tournamentId: tournamentId,
      categoryId: categoryId,
    );
  }
}
