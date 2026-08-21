import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../tournaments/domain/athlete_tournament_day_providers.dart';

/// CTA do Modo Focus na home — acima dos KPIs.
///
/// Botão cheio, cantos [AppRadii.md] (não pill): mesma família dos CTAs do
/// Focus. Some sozinho quando [athleteFocusHomeTargetProvider] devolve null
/// (fora do dia do evento ou atleta eliminado no mata-mata).
class AthleteHomeFocusButton extends ConsumerWidget {
  const AthleteHomeFocusButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final target = ref.watch(athleteFocusHomeTargetProvider).valueOrNull;
    if (target == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.lg,
      ),
      child: SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          onPressed: () => context.pushNamed(
            AppRouteNames.tournamentFocus,
            pathParameters: {'tournamentId': target.tournamentId},
          ),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: Colors.white,
            minimumSize: const Size(0, 48),
            shape: const RoundedRectangleBorder(
              borderRadius: AppRadii.mdAll,
            ),
          ),
          icon: const Icon(Icons.local_fire_department_rounded, size: 18),
          label: const Text('MODO FOCUS'),
        ),
      ),
    );
  }
}
