import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/partner.dart';
import '../../domain/partner_lead.dart';
import 'partner_visuals.dart';

/// Campo do formulário com rótulo em cima e, quando veio do perfil, o selo
/// "DO SEU PERFIL".
class PartnerLeadField extends StatelessWidget {
  const PartnerLeadField({
    super.key,
    required this.label,
    required this.controller,
    this.fromProfile = false,
    this.hint,
    this.keyboardType,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
    this.autofillHints,
    this.textInputAction = TextInputAction.next,
    this.mono = false,
  });

  final String label;
  final TextEditingController controller;
  final bool fromProfile;
  final String? hint;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;
  final Iterable<String>? autofillHints;
  final TextInputAction textInputAction;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    OutlineInputBorder border(Color color, [double width = 1]) =>
        OutlineInputBorder(
          borderRadius: AppRadii.mdAll,
          borderSide: BorderSide(color: color, width: width),
        );
    final textStyle = mono
        ? AppTypography.mono(fontSize: 15, fontWeight: FontWeight.w500)
        : AppTypography.bodyM.copyWith(fontSize: 15);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Flexible(
              child: Text(
                label,
                style: AppTypography.bodyS.copyWith(
                  fontWeight: FontWeight.w600,
                  color: colors.onSurface.withValues(alpha: 0.75),
                ),
              ),
            ),
            if (fromProfile) ...[
              const SizedBox(width: 6),
              Text(
                'DO SEU PERFIL',
                style: AppTypography.mono(
                  fontSize: benefitsMinFontSize,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                  color: colors.win,
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          inputFormatters: inputFormatters,
          textCapitalization: textCapitalization,
          textInputAction: textInputAction,
          autofillHints: autofillHints,
          style: textStyle.copyWith(color: colors.onSurface),
          decoration: InputDecoration(
            isDense: true,
            hintText: hint,
            filled: true,
            fillColor: colors.surfaceCard,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md + 2,
              vertical: 15,
            ),
            border: border(colors.onSurfaceMuted.withValues(alpha: 0.2)),
            enabledBorder: border(colors.onSurfaceMuted.withValues(alpha: 0.2)),
            focusedBorder: border(AppColors.brand, 1.5),
          ),
        ),
      ],
    );
  }
}

/// Caixa de consentimento: obrigatória, a caixa inteira marca e desmarca.
class PartnerLeadConsent extends StatelessWidget {
  const PartnerLeadConsent({
    super.key,
    required this.partner,
    required this.value,
    required this.onChanged,
  });

  final Partner partner;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final style = AppTypography.bodyS.copyWith(
      fontSize: 12.5,
      height: 1.5,
      color: colors.onSurface.withValues(alpha: 0.85),
    );
    return Material(
      color: AppColors.brand.withValues(alpha: 0.07),
      shape: const RoundedRectangleBorder(
        borderRadius: AppRadii.mdAll,
        side: BorderSide(color: AppColors.brand),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: const Key('benefits-lead-consent'),
        onTap: () => onChanged(!value),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md + 2),
          child: MergeSemantics(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: Checkbox(
                    value: value,
                    onChanged: (checked) => onChanged(checked ?? false),
                    activeColor: AppColors.brand,
                    checkColor: AppColors.canvas,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text.rich(
                    boldSpans(
                      leadConsentTextFor(partner),
                      bold: [partner.name],
                      style: style,
                      boldStyle: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
