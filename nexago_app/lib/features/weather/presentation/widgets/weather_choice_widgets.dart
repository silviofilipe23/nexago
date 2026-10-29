import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arenas/domain/arena_booking_success_actions.dart';
import '../weather_ui.dart';

/// Ticket da reserva original (riscado na escolha: o horário foi liberado).
class WeatherBookingTicket extends StatelessWidget {
  const WeatherBookingTicket({
    super.key,
    required this.bookingId,
    required this.start,
    required this.end,
    required this.arenaName,
    required this.courtName,
    this.amountReais,
    this.strike = false,
  });

  final String bookingId;
  final DateTime start;
  final DateTime end;
  final String arenaName;
  final String courtName;
  final double? amountReais;
  final bool strike;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final amount = amountReais;
    return Opacity(
      opacity: strike ? 0.55 : 1,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: WeatherKicker(
                    WeatherCopy.ticketDate(start),
                    color: colors.brandText,
                  ),
                ),
                Text(
                  ArenaBookingSuccessActions.formatBookingDisplayCode(
                      bookingId),
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${WeatherCopy.time(start)} – ${WeatherCopy.time(end)}',
              style: AppTypography.mono(
                fontSize: 30,
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ).copyWith(
                decoration: strike ? TextDecoration.lineThrough : null,
                decorationColor: colors.onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: arenaName,
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  TextSpan(
                    text: ' · $courtName'
                        '${amount != null && amount > 0 ? ' · ${WeatherCopy.money(amount)}' : ''}',
                  ),
                ],
              ),
              style: TextStyle(fontSize: 13, color: colors.onSurfaceMuted),
            ),
          ],
        ),
      ),
    );
  }
}

/// Opção de escolha (rádio em card), `AwxOption` do design.
class WeatherOptionCard extends StatelessWidget {
  const WeatherOptionCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
    this.tag,
    this.enabled = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String? tag;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final border =
        selected ? AppColors.brand : colors.onSurface.withValues(alpha: 0.10);
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.08)
          : colors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: border, width: 1.5),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              WeatherIconTile(
                size: 42,
                background: selected
                    ? AppColors.brand
                    : colors.onSurface.withValues(alpha: 0.05),
                child: Icon(
                  icon,
                  size: 20,
                  color: selected ? AppColors.black : colors.onSurface,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          title,
                          style: AppTypography.soraRegular(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                        if (tag != null)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppColors.win.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(5),
                            ),
                            child: Text(
                              tag!,
                              style: AppTypography.mono(
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.5,
                                color: colors.win,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 12.5,
                        height: 1.45,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: selected
                        ? AppColors.brand
                        : colors.onSurface.withValues(alpha: 0.2),
                    width: 2,
                  ),
                ),
                alignment: Alignment.center,
                child: selected
                    ? Container(
                        width: 10,
                        height: 10,
                        decoration: const BoxDecoration(
                          color: AppColors.brand,
                          shape: BoxShape.circle,
                        ),
                      )
                    : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Barra fixa no rodapé: valor à esquerda (opcional), CTA e ação secundária.
class WeatherBottomBar extends StatelessWidget {
  const WeatherBottomBar({
    super.key,
    required this.ctaLabel,
    required this.onCta,
    this.ctaKey,
    this.ctaIcon = false,
    this.amountLabel,
    this.amountCaption,
    this.secondaryLabel,
    this.onSecondary,
    this.loading = false,
  });

  final String ctaLabel;
  final VoidCallback? onCta;
  final Key? ctaKey;
  final bool ctaIcon;
  final String? amountLabel;
  final String? amountCaption;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final cta = FilledButton(
      key: ctaKey,
      onPressed: loading ? null : onCta,
      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
      child: loading
          ? const SizedBox.square(
              dimension: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                    child: Text(ctaLabel, overflow: TextOverflow.ellipsis)),
                if (ctaIcon) ...[
                  const SizedBox(width: 8),
                  const Icon(Icons.arrow_forward_rounded, size: 18),
                ],
              ],
            ),
    );
    return Container(
      decoration: BoxDecoration(
        color: colors.canvas,
        border: Border(
          top: BorderSide(color: colors.onSurface.withValues(alpha: 0.08)),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (amountLabel != null)
                Row(
                  children: [
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (amountCaption != null)
                          Text(
                            amountCaption!,
                            style: TextStyle(
                              fontSize: 11.5,
                              color: colors.onSurfaceMuted,
                            ),
                          ),
                        Text(
                          amountLabel!,
                          style: AppTypography.mono(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: colors.onSurface,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: 16),
                    Expanded(child: cta),
                  ],
                )
              else
                cta,
              if (secondaryLabel != null) ...[
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: loading ? null : onSecondary,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                  ),
                  child: Text(secondaryLabel!),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
