import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Saída "garantir vaga sem dupla" — para o atleta cujo parceiro não está no
/// app. Card claro (não um botão escondido), mas secundário em relação à busca.
class TournamentRegistrationSoloCard extends StatelessWidget {
  const TournamentRegistrationSoloCard({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Material(
      color: AppColors.brand.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.3)),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(
                  Icons.bookmark_added_outlined,
                  size: 20,
                  color: AppColors.brand,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Sem dupla aqui? Garanta sua vaga',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Reserve agora e encontre o parceiro depois.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
            ],
          ),
        ),
      ),
    );
  }
}
