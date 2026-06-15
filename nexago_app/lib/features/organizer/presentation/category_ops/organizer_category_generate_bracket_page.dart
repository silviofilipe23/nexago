import 'package:flutter/material.dart';

import 'organizer_category_generate_de_page.dart';
import 'organizer_category_generate_groups_page.dart';

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
    if (format == 'double_elimination') {
      return OrganizerCategoryGenerateDePage(
        tournamentId: tournamentId,
        categoryId: categoryId,
        format: format,
      );
    }
    return OrganizerCategoryGenerateGroupsPage(
      tournamentId: tournamentId,
      categoryId: categoryId,
      format: format,
    );
  }
}
