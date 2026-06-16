import 'package:flutter/material.dart';

import 'organizer_category_generate_de_page.dart';
import 'organizer_category_generate_groups_page.dart';
import 'organizer_category_generate_se_page.dart';

class OrganizerCategoryGenerateBracketPage extends StatelessWidget {
  const OrganizerCategoryGenerateBracketPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    required this.format,
  });

  final String tournamentId;
  final String categoryId;
  final String format;

  @override
  Widget build(BuildContext context) {
    return switch (format) {
      'double_elimination' => OrganizerCategoryGenerateDePage(
          tournamentId: tournamentId,
          categoryId: categoryId,
          format: format,
        ),
      'groups_knockout' => OrganizerCategoryGenerateGroupsPage(
          tournamentId: tournamentId,
          categoryId: categoryId,
          format: format,
        ),
      _ => OrganizerCategoryGenerateSePage(
          tournamentId: tournamentId,
          categoryId: categoryId,
          format: format,
        ),
    };
  }
}
