import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/lgpd_term.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Checkbox inline do termo LGPD/uso de imagem — porte do
/// `app-lgpd-consent-box` do portal do atleta.
///
/// Substitui o bottom sheet que o app abria antes de cada ação. O sheet
/// interrompia o fluxo e não deixava rastro na tela: quem já tinha aceitado não
/// via o aceite em lugar nenhum, e o cartão de resumo não tinha o que mostrar.
/// Marcado aqui, o aceite viaja como `lgpdAccepted: true` nas callables — o
/// mesmo contrato de antes.
class RegistrationLgpdConsentBox extends StatefulWidget {
  const RegistrationLgpdConsentBox({
    super.key,
    required this.accepted,
    required this.onChanged,
    this.enabled = true,
  });

  final bool accepted;
  final ValueChanged<bool> onChanged;
  final bool enabled;

  @override
  State<RegistrationLgpdConsentBox> createState() =>
      _RegistrationLgpdConsentBoxState();
}

class _RegistrationLgpdConsentBoxState
    extends State<RegistrationLgpdConsentBox> {
  bool _showTerm = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 24,
                height: 24,
                child: Checkbox(
                  value: widget.accepted,
                  onChanged: widget.enabled
                      ? (v) => widget.onChanged(v ?? false)
                      : null,
                  activeColor: AppColors.brand,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    GestureDetector(
                      onTap: widget.enabled
                          ? () => widget.onChanged(!widget.accepted)
                          : null,
                      child: Text(
                        lgpdCheckboxLabel,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: colors.onSurface,
                          height: 1.4,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    const SizedBox(height: 2),
                    TextButton(
                      onPressed: () =>
                          setState(() => _showTerm = !_showTerm),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text(
                        _showTerm ? 'Ocultar termo' : 'Ler termo completo',
                        style: AppTypography.mono(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.brand,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (_showTerm) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              lgpdTermTitle,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.onSurface,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            for (final paragraph in lgpdTermParagraphs) ...[
              Text(
                paragraph,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceMuted,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
          ],
        ],
      ),
    );
  }
}
