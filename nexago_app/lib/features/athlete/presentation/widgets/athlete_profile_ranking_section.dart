import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../ranking/domain/ranking_providers.dart';
import '../../../tournaments/presentation/widgets/compete_hub/compete_hub_ranking_card.dart';

/// Ranking do atleta na tela de perfil (dados via [competeHubUserRankingProvider]).
class AthleteProfileRankingSection extends ConsumerWidget {
  const AthleteProfileRankingSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rankingAsync = ref.watch(competeHubUserRankingProvider);

    return rankingAsync.when(
      loading: () => SizedBox(
        height: 160,
        child: Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      ),
      error: (_, __) => Text(
        'Não foi possível carregar seu ranking.',
        style: TextStyle(color: context.themeColors.onSurfaceMuted),
      ),
      data: (ranking) {
        if (ranking == null) return const SizedBox.shrink();
        return CompeteHubRankingCard(ranking: ranking);
      },
    );
  }
}
