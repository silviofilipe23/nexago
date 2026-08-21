import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../domain/tournament_discovery_providers.dart';
import 'widgets/bracket/double_elimination_bracket_view.dart';

class DoubleEliminationBracketPage extends ConsumerWidget {
  const DoubleEliminationBracketPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tournamentAsync = ref.watch(tournamentDetailProvider(tournamentId));

    final categoryName = tournamentAsync.valueOrNull?.categoryOffers
            .where((o) => o.id == categoryId)
            .map((o) => o.name)
            .firstOrNull ??
        categoryId;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        backgroundColor: context.themeColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_rounded,
              color: context.themeColors.onSurface),
          onPressed: () => context.pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Chave interativa',
              style: AppTypography.soraRegular(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurface,
              ),
            ),
            Text(
              categoryName,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
      body: DoubleEliminationBracketView(
        tournamentId: tournamentId,
        categoryId: categoryId,
      ),
    );
  }
}
