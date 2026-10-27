import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

/// Peças visuais da tela "Como funciona" — cartão, seção, linha de valor,
/// passo numerado, nota e botão de atalho.

/// Cartão base. Com [tint], vira o cartão de destaque da aba (fundo e borda
/// na cor do tema daquela medida).
class HowItWorksCard extends StatelessWidget {
  const HowItWorksCard({
    super.key,
    required this.child,
    this.tint,
    this.padding = const EdgeInsets.all(16),
  });

  final Widget child;
  final Color? tint;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tint = this.tint;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: tint == null ? colors.surfaceCard : tint.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: tint == null
              ? colors.onSurfaceMuted.withValues(alpha: 0.12)
              : tint.withValues(alpha: 0.35),
        ),
      ),
      child: child,
    );
  }
}

/// Rótulo em mono maiúsculo (`SEU NÍVEL`, `A ESCALA`).
class HowItWorksKicker extends StatelessWidget {
  const HowItWorksKicker(this.text, {super.key, this.color});

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

class HowItWorksSection extends StatelessWidget {
  const HowItWorksSection({
    super.key,
    required this.title,
    required this.child,
  });

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(header: true, child: HowItWorksKicker(title)),
        const SizedBox(height: 10),
        child,
      ],
    );
  }
}

/// Linha "rótulo · valor" das tabelas (XP por ação, pontos por resultado).
class HowItWorksValueRow extends StatelessWidget {
  const HowItWorksValueRow({
    super.key,
    required this.title,
    required this.value,
    this.subtitle,
    this.valueColor,
    this.last = false,
  });

  final String title;
  final String value;
  final String? subtitle;
  final Color? valueColor;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final subtitle = this.subtitle;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        border: last
            ? null
            : Border(
                bottom: BorderSide(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.12),
                ),
              ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontSize: 11.5,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(
            value,
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: valueColor ?? colors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

/// Passo numerado com o fio ligando ao próximo.
class HowItWorksStep extends StatelessWidget {
  const HowItWorksStep({
    super.key,
    required this.number,
    required this.title,
    required this.subtitle,
    this.last = false,
  });

  final int number;
  final String title;
  final String subtitle;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final line = colors.onSurfaceMuted.withValues(alpha: 0.25);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            children: [
              Container(
                width: 26,
                height: 26,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  shape: BoxShape.circle,
                  border: Border.all(color: line),
                ),
                child: Text(
                  '$number',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              if (!last)
                Expanded(
                  child: Container(
                    width: 1,
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    color: line,
                  ),
                ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(top: 3, bottom: last ? 0 : 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontSize: 12,
                      height: 1.4,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Nota de rodapé da aba — a regra que mais confunde, dita em uma frase.
class HowItWorksNote extends StatelessWidget {
  const HowItWorksNote(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(
              Icons.info_outline_rounded,
              size: 16,
              color: colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontSize: 12,
                    height: 1.45,
                    color: colors.onSurfaceMuted,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Botão de contorno, largura cheia, para o atalho no fim da aba.
class HowItWorksLinkButton extends StatelessWidget {
  const HowItWorksLinkButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        foregroundColor: colors.onSurface,
        side: BorderSide(color: colors.onSurfaceMuted.withValues(alpha: 0.3)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
      ),
    );
  }
}

/// Pílula de escolha (esporte na aba Nível, categoria na aba Ranking).
class HowItWorksChoicePill extends StatelessWidget {
  const HowItWorksChoicePill({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final foreground = selected ? colors.brandText : colors.onSurfaceMuted;
    final icon = this.icon;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.12)
            : colors.surfaceCard,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: selected
                    ? AppColors.brand.withValues(alpha: 0.45)
                    : colors.onSurfaceMuted.withValues(alpha: 0.2),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 16, color: foreground),
                  const SizedBox(width: 6),
                ],
                Text(
                  label,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: foreground,
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
