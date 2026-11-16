import 'package:flutter/material.dart';

import '../../../../core/theme/app_borders.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/partner.dart';
import 'partner_visuals.dart';

Future<T?> _showClubSheet<T>(BuildContext context, WidgetBuilder builder) =>
    showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: context.themeColors.surfaceSheet,
      builder: builder,
    );

/// Folha "Como funciona o clube", na primeira visita de cada conta.
Future<void> showBenefitsHowItWorksSheet(BuildContext context) =>
    _showClubSheet<void>(context, (_) => const _HowItWorksSheet());

class _HowItWorksSheet extends StatelessWidget {
  const _HowItWorksSheet();

  static const Key okKey = Key('benefits-how-it-works-ok');

  static const _points = [
    (
      icon: Icons.touch_app_rounded,
      title: 'Um toque e pronto',
      text: 'Escolha o parceiro e toque no botão. O cupom já vai copiado.',
    ),
    (
      icon: Icons.qr_code_2_rounded,
      title: 'Na loja, mostre o QR',
      text: 'Sua carteirinha tem um código só seu para o balcão.',
    ),
    (
      icon: Icons.volunteer_activism_rounded,
      title: 'É de graça',
      text: 'Você não paga nada a mais e não precisa juntar pontos.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          0,
          AppSpacing.screenH,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _RoundIcon(
              icon: Icons.card_giftcard_rounded,
              color: colors.brandText,
            ),
            const SizedBox(height: AppSpacing.md),
            Semantics(
              header: true,
              child: Text(
                'Como funciona o clube',
                style: AppTypography.titleL.copyWith(color: colors.onSurface),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            for (final point in _points) ...[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: AppColors.brand.withValues(alpha: 0.12),
                      borderRadius: AppRadii.mdAll,
                    ),
                    child: Icon(point.icon, size: 18, color: colors.brandText),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          point.title,
                          style: AppTypography.titleS.copyWith(
                            fontSize: 14,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          point.text,
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 13,
                            height: 1.4,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            const SizedBox(height: AppSpacing.sm),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                key: okKey,
                onPressed: () => Navigator.of(context).pop(),
                style: FilledButton.styleFrom(
                  shape: const RoundedRectangleBorder(
                    borderRadius: AppRadii.mdAll,
                  ),
                ),
                child: Text(
                  'Entendi',
                  style: AppTypography.labelL.copyWith(fontSize: 15),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon({required this.icon, required this.color});

  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: 52,
    height: 52,
    decoration: BoxDecoration(
      color: AppColors.brand.withValues(alpha: 0.12),
      shape: BoxShape.circle,
    ),
    child: Icon(icon, size: 24, color: color),
  );
}

/// Resposta da folha "Conseguiu usar?": `true` (sim), `false` (não deu
/// certo) ou `null` ("Agora não", ou a folha fechada sem resposta).
Future<bool?> showBenefitUseQuestionSheet(
  BuildContext context, {
  required Partner partner,
  required String subtitle,
}) => _showClubSheet<bool>(
  context,
  (_) => _QuestionSheet(partner: partner, subtitle: subtitle),
);

class _QuestionSheet extends StatelessWidget {
  const _QuestionSheet({required this.partner, required this.subtitle});

  final Partner partner;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final navigator = Navigator.of(context);
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          0,
          AppSpacing.screenH,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PartnerLogo(
              partner: partner,
              size: 52,
              borderRadius: AppRadii.mdAll,
            ),
            const SizedBox(height: AppSpacing.md),
            Semantics(
              header: true,
              child: Text(
                'Conseguiu usar o desconto na ${partner.name}?',
                style: AppTypography.titleL.copyWith(color: colors.onSurface),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              subtitle,
              style: AppTypography.bodyS.copyWith(
                fontSize: 13,
                height: 1.45,
                color: colors.onSurfaceMuted,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                key: const Key('benefits-question-yes'),
                onPressed: () => navigator.pop(true),
                style: FilledButton.styleFrom(
                  shape: const RoundedRectangleBorder(
                    borderRadius: AppRadii.mdAll,
                  ),
                ),
                child: Text(
                  'Sim',
                  style: AppTypography.labelL.copyWith(fontSize: 15),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: OutlinedButton(
                key: const Key('benefits-question-no'),
                onPressed: () => navigator.pop(false),
                style: OutlinedButton.styleFrom(
                  side: AppBorders.strongSide(colors),
                  shape: const RoundedRectangleBorder(
                    borderRadius: AppRadii.mdAll,
                  ),
                ),
                child: Text(
                  'Não deu certo',
                  style: AppTypography.labelL.copyWith(color: colors.onSurface),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            SizedBox(
              width: double.infinity,
              height: benefitsLaterHeight,
              child: TextButton(
                key: const Key('benefits-question-later'),
                onPressed: () => navigator.pop(),
                child: Text(
                  'Agora não',
                  style: AppTypography.labelL.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Altura do "Agora não" (alvo de toque de 44).
const double benefitsLaterHeight = 44;
