import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../../core/ui/nexa_card.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// "Resumo da inscrição" — a coluna lateral do portal, que no celular vira o
/// último cartão do scroll (não há espaço para duas colunas).
class RegistrationShellSummaryCard extends StatelessWidget {
  const RegistrationShellSummaryCard({
    super.key,
    required this.tournamentName,
    required this.locationLine,
    required this.dateLabel,
    required this.categoryName,
    required this.statusLabel,
    required this.priceLabel,
    required this.priceUnitLabel,
    this.teamName,
    this.uniformLabel,
    this.lgpdLabel,
  });

  final String tournamentName;
  final String locationLine;
  final String dateLabel;
  final String categoryName;
  final String statusLabel;
  final String priceLabel;

  /// "dupla" / "equipe" — o rótulo do preço é "Inscrição (por dupla)".
  final String priceUnitLabel;

  final String? teamName;

  /// `null` quando a categoria não pede uniforme.
  final String? uniformLabel;

  /// `null` antes de existir inscrição — não há aceite para relatar.
  final String? lgpdLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return NexaCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Resumo da inscrição',
            style: AppTypography.soraRegular(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 4,
                height: 42,
                decoration: BoxDecoration(
                  color: AppColors.brand,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tournamentName,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: colors.onSurface,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (locationLine.isNotEmpty)
                      Text(
                        locationLine,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    Text(
                      dateLabel,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          _SummaryRow(label: 'Categoria', value: categoryName),
          if (teamName != null) _SummaryRow(label: 'Equipe', value: teamName!),
          _SummaryRow(label: 'Status', value: statusLabel),
          if (uniformLabel != null)
            _SummaryRow(label: 'Uniforme', value: uniformLabel!),
          if (lgpdLabel != null)
            _SummaryRow(label: 'Termo LGPD', value: lgpdLabel!),
          _SummaryRow(
            label: 'Inscrição (por $priceUnitLabel)',
            value: priceLabel,
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceMuted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.onSurface,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
