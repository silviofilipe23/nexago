import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/gamification_models.dart';

/// Card de XP da tela Desafios quando a flag do elo está desligada. Mostra só
/// o total: XP mede o quanto o atleta joga e não vira "nível" — nível é a
/// habilidade, explicada em "Como funciona", que o toque abre.
class AthleteQuestLevelCard extends StatelessWidget {
  const AthleteQuestLevelCard({
    super.key,
    required this.summary,
  });

  final GamificationSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.pushNamed(
          AppRouteNames.athleteHowItWorks,
          queryParameters: const {'aba': 'elo'},
        ),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.themeColors.surfaceRaised),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.brand.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: AppColors.brand.withValues(alpha: 0.4),
                      ),
                    ),
                    child: Icon(
                      Icons.bolt_rounded,
                      size: 20,
                      color: context.themeColors.brandText,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'SEU XP',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.1,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ),
                  Text(
                    '${NumberFormat.decimalPattern('pt_BR').format(summary.xp)} XP',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                'XP mostra o quanto você joga. Ele não muda seu nível nem sua '
                'categoria.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
