import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../ranking/domain/ranking_providers.dart';
import 'compete_hub_ranking_row.dart';
import 'compete_hub_section_header.dart';

class CompeteHubRankingSection extends ConsumerWidget {
  const CompeteHubRankingSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entriesAsync = ref.watch(competeHubRankingEntriesProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CompeteHubSectionHeader(
          title: 'Ranking',
          actionLabel: 'VER COMPLETO',
          onActionTap: () => context.pushNamed(AppRouteNames.athleteRanking),
        ),
        SizedBox(height: 10),
        entriesAsync.when(
          loading: () => const _RankingLoading(),
          error: (_, __) => const _RankingMessage(
            'Não foi possível carregar o ranking.',
          ),
          data: (entries) {
            if (entries.isEmpty) {
              return const _RankingMessage(
                'Ranking disponível após resultados oficiais da temporada.',
              );
            }
            return Container(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
              decoration: BoxDecoration(
                color: context.themeColors.surfaceCard,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: context.themeColors.surfaceRaised),
              ),
              child: Column(
                children: [
                  for (var i = 0; i < entries.length; i++) ...[
                    if (i > 0) SizedBox(height: 2),
                    CompeteHubRankingRow(entry: entries[i]),
                  ],
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

class _RankingLoading extends StatelessWidget {
  const _RankingLoading();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 180,
      child: Center(
        child: CircularProgressIndicator(color: AppColors.brand),
      ),
    );
  }
}

class _RankingMessage extends StatelessWidget {
  const _RankingMessage(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Text(
        message,
        style: TextStyle(color: context.themeColors.onSurfaceMuted),
      ),
    );
  }
}
