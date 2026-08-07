import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/theme/app_colors.dart';

/// Convite ao dono de arena, no fim da lista de busca.
///
/// Fica no fim de propósito: quem rolou até aqui já viu as arenas da região, e
/// é o momento em que um dono pensa "cadê a minha". O laranja da marca na borda
/// sinaliza que quem fala é a plataforma, não mais uma arena.
class ArenaSearchSignupCtaCard extends StatelessWidget {
  const ArenaSearchSignupCtaCard({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.brand.withValues(alpha: 0.10),
            colors.surfaceCard,
          ],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Gostaria de ver sua arena aqui?',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          SizedBox(height: 6),
          Text(
            'Cadastre sua arena na nexaGO e receba atletas procurando quadra '
            'na sua região.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: colors.onSurfaceMuted,
              height: 1.4,
            ),
          ),
          SizedBox(height: 14),
          FilledButton(
            onPressed: onTap,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              padding: const EdgeInsets.symmetric(
                horizontal: 18,
                vertical: 12,
              ),
            ),
            child: Text(
              'Quero cadastrar minha arena',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}
