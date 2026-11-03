import 'package:flutter/material.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';

/// Peças do protótipo "Atleta · Planos de horário" (`Aph*`), nos tokens do
/// tema: funcionam no escuro (padrão) e no claro.

/// "R$ 450" quando é inteiro; "R$ 427,50" quando tem centavos.
String scheduleMoney(num reais) {
  final cents = (reais * 100).round();
  return cents % 100 == 0 ? formatBRLWhole(reais) : formatBRL(reais);
}

/// Linha fina do design (`APH.line`).
Color scheduleLine(BuildContext context) =>
    context.themeColors.onSurface.withValues(alpha: 0.08);

/// Rótulo mono em caixa alta (`AphMono`).
class ScheduleKicker extends StatelessWidget {
  const ScheduleKicker(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: AppTypography.mono(
        fontSize: 10.5,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.2,
        color: color ?? context.themeColors.onSurfaceMuted,
      ),
    );
  }
}

/// Cartão do design (`AphCard`): selecionado ganha borda e fundo laranja.
class ScheduleCard extends StatelessWidget {
  const ScheduleCard({
    super.key,
    required this.child,
    this.selected = false,
    this.onTap,
    this.padding = const EdgeInsets.all(16),
  });

  final Widget child;
  final bool selected;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final radius = BorderRadius.circular(18);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: radius,
        child: Ink(
          padding: padding,
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brand.withValues(alpha: colors.isDark ? 0.07 : 0.06)
                : colors.surfaceCard,
            borderRadius: radius,
            border: Border.all(
              width: 1.5,
              color: selected ? AppColors.brand : scheduleLine(context),
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Chip de largura flexível (`AphChip`): dia da semana, ciclo.
class ScheduleChoiceChip extends StatelessWidget {
  const ScheduleChoiceChip({
    super.key,
    required this.label,
    this.sub,
    this.selected = false,
    this.enabled = true,
    this.onTap,
  });

  final String label;
  final String? sub;
  final bool selected;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final radius = BorderRadius.circular(12);
    final ink = selected ? AppColors.black : colors.onSurface;
    return Semantics(
      button: true,
      selected: selected,
      enabled: enabled,
      child: Opacity(
        opacity: enabled ? 1 : 0.45,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: enabled ? onTap : null,
            borderRadius: radius,
            child: Ink(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
              decoration: BoxDecoration(
                color: selected ? AppColors.brand : colors.surfaceCard,
                borderRadius: radius,
                border: Border.all(
                  color: selected ? AppColors.brand : scheduleLine(context),
                ),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: ink,
                    ),
                  ),
                  if (sub != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      sub!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        color: selected
                            ? AppColors.black.withValues(alpha: 0.7)
                            : colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Selo verde "−17%" do cartão do plano.
class ScheduleDiscountBadge extends StatelessWidget {
  const ScheduleDiscountBadge({super.key, required this.percent});

  final int percent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.win.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        '−$percent%',
        style: AppTypography.mono(
          fontSize: 10.5,
          fontWeight: FontWeight.w700,
          color: colors.win,
        ),
      ),
    );
  }
}

/// Faixa de aviso (suspenso, pausado, saindo, oferta).
class ScheduleBanner extends StatelessWidget {
  const ScheduleBanner({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    required this.tone,
    this.action,
  });

  final IconData icon;
  final String title;
  final String? message;

  /// Tom cru do [AppColors] (`live`, `pending`, `win`, `brand`).
  final Color tone;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final ink = colors.readableTone(tone);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tone.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: ink),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTypography.soraRegular(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                if (message != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    message!,
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.4,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
                if (action != null) ...[
                  const SizedBox(height: 10),
                  action!,
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Botão laranja cheio do rodapé.
class SchedulePrimaryButton extends StatelessWidget {
  const SchedulePrimaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.loading = false,
    this.icon = Icons.arrow_forward_rounded,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.black,
          disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.35),
          disabledForegroundColor: AppColors.black.withValues(alpha: 0.6),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        onPressed: loading ? null : onPressed,
        child: loading
            ? const SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: AppColors.black,
                ),
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppColors.black,
                      ),
                    ),
                  ),
                  if (icon != null) ...[
                    const SizedBox(width: 8),
                    Icon(icon, size: 18),
                  ],
                ],
              ),
      ),
    );
  }
}

/// Alça e título padrão das folhas.
class ScheduleSheetHeader extends StatelessWidget {
  const ScheduleSheetHeader({super.key, required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: colors.onSurfaceMuted.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(99),
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          title,
          style: AppTypography.soraRegular(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: colors.onSurface,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 6),
          Text(
            subtitle!,
            style: TextStyle(
              fontSize: 13,
              height: 1.45,
              color: colors.onSurfaceMuted,
            ),
          ),
        ],
      ],
    );
  }
}

/// Abre uma folha no padrão do app (fundo elevado, cantos de 20).
Future<T?> showScheduleSheet<T>(
  BuildContext context, {
  required WidgetBuilder builder,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceRaised,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.9,
    ),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: builder,
  );
}
