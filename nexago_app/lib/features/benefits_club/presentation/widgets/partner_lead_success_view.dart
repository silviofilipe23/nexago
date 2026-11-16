import 'package:flutter/material.dart';

import '../../../../core/theme/app_borders.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/partner_lead.dart';
import 'benefit_partner_parts.dart';

/// "Pronto!" depois do envio do formulário: a mensagem do parceiro e o resumo
/// do que foi enviado.
class PartnerLeadSuccessView extends StatelessWidget {
  const PartnerLeadSuccessView({
    super.key,
    required this.partnerName,
    required this.whatsapp,
    required this.neighborhood,
    required this.message,
    required this.onBackToClub,
  });

  final String partnerName;
  final String whatsapp;
  final String neighborhood;

  /// `successMessage` da callable (ou a padrão).
  final String message;
  final VoidCallback onBackToClub;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final body = leadSuccessBody(message);
    return Scaffold(
      backgroundColor: colors.canvas,
      body: Column(
        children: [
          Expanded(
            child: SafeArea(
              bottom: false,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.xxl,
                  70,
                  AppSpacing.xxl,
                  AppSpacing.xxl,
                ),
                children: [
                  Center(
                    child: Container(
                      width: 84,
                      height: 84,
                      decoration: BoxDecoration(
                        color: AppColors.win,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.win.withValues(alpha: 0.12),
                            spreadRadius: 14,
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.check_rounded,
                        size: 40,
                        color: AppColors.canvas,
                      ),
                    ),
                  ),
                  const SizedBox(height: 36),
                  Semantics(
                    header: true,
                    liveRegion: true,
                    child: Text(
                      'Pronto!',
                      textAlign: TextAlign.center,
                      style: AppTypography.soraRegular(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                  if (body.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.md + 2),
                    Text(
                      body,
                      textAlign: TextAlign.center,
                      style: AppTypography.bodyM.copyWith(
                        color: colors.onSurfaceMuted,
                        height: 1.5,
                      ),
                    ),
                  ],
                  const SizedBox(height: 28),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.lg,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: colors.surfaceCard,
                      borderRadius: AppRadii.lgAll,
                      border: AppBorders.subtle(colors),
                    ),
                    child: Column(
                      children: [
                        _SummaryRow(label: 'Parceiro', value: partnerName),
                        _SummaryRow(
                          label: 'WhatsApp',
                          value: whatsapp,
                          divided: true,
                        ),
                        _SummaryRow(
                          label: 'Bairro',
                          value: neighborhood,
                          divided: true,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          BenefitCtaBar(
            buttonKey: const Key('benefits-lead-back-to-club'),
            label: 'Voltar ao clube',
            hint: null,
            onPressed: onBackToClub,
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.label,
    required this.value,
    this.divided = false,
  });

  final String label;
  final String value;
  final bool divided;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      decoration: BoxDecoration(
        border: divided ? Border(top: AppBorders.subtleSide(colors)) : null,
      ),
      child: Row(
        children: [
          Text(
            label,
            style: AppTypography.bodyS.copyWith(
              fontSize: 13,
              color: colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: AppTypography.bodyS.copyWith(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: colors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
