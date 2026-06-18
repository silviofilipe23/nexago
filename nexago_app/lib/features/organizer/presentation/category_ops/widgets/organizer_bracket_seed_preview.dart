import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/category_ops/category_ops_logic.dart';
import '../../../domain/category_ops/category_ops_models.dart';

/// Prévia da chave antes de gerar: resumo da estrutura (tamanho/byes) e a
/// lista de duplas na ORDEM DE SEED, para o organizador validar antes de
/// publicar (ação destrutiva).
class OrganizerBracketSeedPreview extends StatelessWidget {
  const OrganizerBracketSeedPreview({
    super.key,
    required this.teams,
    this.byesHighlight = true,
  });

  /// Duplas já na ordem de seed (índice 0 = cabeça 1).
  final List<OrganizerCategoryTeamRow> teams;
  final bool byesHighlight;

  @override
  Widget build(BuildContext context) {
    final byes = bracketStructure(teams.length).byes;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.brand.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.28)),
          ),
          child: Row(
            children: [
              const Icon(Icons.account_tree_outlined,
                  size: 18, color: AppColors.brand),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  bracketStructureSummary(teams.length),
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                    height: 1.3,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'ORDEM DE SEED',
          style: AppTypography.mono(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 8),
        for (var i = 0; i < teams.length; i++)
          _SeedRow(
            rank: i + 1,
            name: teams[i].displayName,
            getsBye: byesHighlight && i < byes,
          ),
      ],
    );
  }
}

class _SeedRow extends StatelessWidget {
  const _SeedRow({
    required this.rank,
    required this.name,
    required this.getsBye,
  });

  final int rank;
  final String name;
  final bool getsBye;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '$rank',
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: AppColors.brand,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          if (getsBye)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.win.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                'BYE',
                style: AppTypography.mono(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  color: AppColors.win,
                  letterSpacing: 0.4,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
