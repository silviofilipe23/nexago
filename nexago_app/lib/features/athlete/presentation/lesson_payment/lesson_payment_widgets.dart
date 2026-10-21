import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';

/// Peças de "Pagamento confirmado" e do comprovante (protótipo B17/B19).
/// Tons derivados do tema: secundário 62%, terciário 42%, linha 8%.
abstract final class LessonPaymentStyle {
  LessonPaymentStyle._();

  /// Azul do professor independente.
  static const Color blue = Color(0xFF5B9BFF);

  static Color mute(AppThemeColors c) => c.onSurface.withValues(alpha: 0.62);
  static Color dim(AppThemeColors c) => c.onSurface.withValues(alpha: 0.42);
  static Color line(AppThemeColors c) => c.onSurface.withValues(alpha: 0.08);

  static TextStyle sora(
    double size, {
    Color? color,
    FontWeight weight = FontWeight.w700,
  }) =>
      AppTypography.soraRegular(
        fontSize: size,
        fontWeight: weight,
        letterSpacing: -size * 0.01,
        height: 1.25,
        color: color,
      );

  static TextStyle mono(double size, {Color? color}) => AppTypography.mono(
        fontSize: size,
        fontWeight: FontWeight.w600,
        color: color,
        letterSpacing: size * 0.08,
      );
}

/// Caixa arredondada com borda de 8% (os cartões das duas telas).
class LessonPaymentCard extends StatelessWidget {
  const LessonPaymentCard({
    super.key,
    required this.child,
    this.raised = false,
    this.radius = 16,
  });

  final Widget child;
  final bool raised;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: raised ? colors.surfaceRaised : colors.surfaceCard,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: LessonPaymentStyle.line(colors)),
      ),
      clipBehavior: Clip.antiAlias,
      child: child,
    );
  }
}

/// Linha "rótulo (+ dica mono) … valor" da lista de detalhes.
class LessonPaymentDetailRow extends StatelessWidget {
  const LessonPaymentDetailRow({
    super.key,
    required this.label,
    required this.value,
    this.hint,
    this.valueHint,
    this.trailing,
    this.divider = true,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
  });

  final String label;
  final String value;

  /// Linha miúda debaixo do rótulo ("Compensado na hora").
  final String? hint;

  /// Linha miúda debaixo do valor (comprovante: "CPF ···").
  final String? valueHint;
  final Widget? trailing;
  final bool divider;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        border: divider
            ? Border(bottom: BorderSide(color: LessonPaymentStyle.line(colors)))
            : null,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    color: LessonPaymentStyle.mute(colors),
                  ),
                ),
                if (hint != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    hint!,
                    style: LessonPaymentStyle.mono(
                      9.5,
                      color: LessonPaymentStyle.dim(colors),
                    ).copyWith(letterSpacing: 0.2),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Flexible(
                      child: Text(
                        value,
                        textAlign: TextAlign.right,
                        style: LessonPaymentStyle.sora(
                          13,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    if (trailing != null) ...[
                      const SizedBox(width: 6),
                      trailing!,
                    ],
                  ],
                ),
                if (valueHint != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    valueHint!,
                    textAlign: TextAlign.right,
                    style: LessonPaymentStyle.mono(
                      9.5,
                      color: LessonPaymentStyle.dim(colors),
                    ).copyWith(letterSpacing: 0.2),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Botão laranja cheio (CTA do rodapé).
class LessonPaymentPrimaryButton extends StatelessWidget {
  const LessonPaymentPrimaryButton({
    super.key,
    required this.label,
    required this.onTap,
    this.icon,
  });

  final String label;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.brand,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: SizedBox(
          height: 52,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 18, color: const Color(0xFF0A0A0A)),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: LessonPaymentStyle.sora(
                    15,
                    color: const Color(0xFF0A0A0A),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Botão de contorno (o "Baixar PDF" do comprovante).
class LessonPaymentOutlineButton extends StatelessWidget {
  const LessonPaymentOutlineButton({
    super.key,
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: colors.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: colors.onSurface.withValues(alpha: 0.14)),
      ),
      child: InkWell(
        customBorder: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
        onTap: onTap,
        child: SizedBox(
          height: 52,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: colors.onSurface),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: LessonPaymentStyle.sora(15, color: colors.onSurface),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Tela de espera/erro centrada (cobrança ainda sem baixa, não encontrada…).
class LessonPaymentStatusView extends StatelessWidget {
  const LessonPaymentStatusView({
    super.key,
    required this.title,
    required this.message,
    this.icon,
    this.loading = false,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String message;
  final IconData? icon;
  final bool loading;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (loading)
              SizedBox(
                width: 34,
                height: 34,
                child: CircularProgressIndicator(
                  strokeWidth: 3,
                  color: colors.brand,
                ),
              )
            else if (icon != null)
              Icon(icon, size: 40, color: LessonPaymentStyle.mute(colors)),
            const SizedBox(height: 18),
            Text(
              title,
              textAlign: TextAlign.center,
              style: LessonPaymentStyle.sora(
                19,
                color: colors.onSurface,
                weight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: AppTypography.soraRegular(
                fontSize: 13.5,
                height: 1.45,
                color: LessonPaymentStyle.mute(colors),
              ),
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 22),
              TextButton(
                onPressed: onAction,
                child: Text(
                  actionLabel!,
                  style: LessonPaymentStyle.sora(
                    13.5,
                    color: colors.brandText,
                    weight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
