import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../arenas/domain/arena_slot_block_reason.dart';
import '../../domain/arena_schedule_models.dart';
import '../../domain/arena_slot_detail_providers.dart';
import 'arena_dashboard_tokens.dart';

class ArenaScheduleCourtTile extends ConsumerWidget {
  const ArenaScheduleCourtTile({
    super.key,
    required this.row,
    required this.onTap,
    required this.onLongPress,
  });

  final ArenaScheduleCourtRow row;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final slot = row.slot;
    final (statusLabel, statusColor) = _status(slot);

    final subtitle = _SubtitleBuilder(
      row: row,
      athleteLabelAsync: row.booking != null
          ? ref.watch(athleteDisplayLabelProvider(row.booking!.athleteId))
          : null,
    );

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        onLongPress: slot.isAvailable ? onLongPress : null,
        borderRadius: BorderRadius.circular(12),
        child: Ink(
          decoration: ArenaDashboardTokens.cardDecoration(context),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        row.courtName,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: AppColors.onSurface,
                        ),
                      ),
                      SizedBox(height: 4),
                      subtitle.build(theme),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (slot.isAvailable && slot.hasPromotion)
                      Container(
                        margin: const EdgeInsets.only(bottom: 4),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.brand.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          'PROMO',
                          style: TextStyle(
                            color: AppColors.brand,
                            fontWeight: FontWeight.w800,
                            fontSize: 9,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        statusLabel,
                        style: TextStyle(
                          color: statusColor,
                          fontWeight: FontWeight.w800,
                          fontSize: 10,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static (String, Color) _status(dynamic slot) {
    if (slot.isBooked) return ('RESERVADO', AppColors.live);
    if (slot.isBlocked) {
      if (slot.blockReason?.name == 'aula') {
        return ('AULA', AppColors.pending);
      }
      return ('BLOQUEADO', AppColors.onSurfaceMuted);
    }
    return ('DISPONÍVEL', AppColors.win);
  }
}

class _SubtitleBuilder {
  const _SubtitleBuilder({required this.row, required this.athleteLabelAsync});

  final ArenaScheduleCourtRow row;
  final AsyncValue<String>? athleteLabelAsync;

  Widget build(ThemeData theme) {
    final slot = row.slot;
    final muted = theme.textTheme.bodySmall?.copyWith(
      color: AppColors.onSurfaceMuted,
      fontWeight: FontWeight.w500,
    );

    if (slot.isBooked) {
      final booking = row.booking;
      final name =
          athleteLabelAsync?.maybeWhen(
            data: (n) => n,
            orElse: () => 'Atleta',
          ) ??
          'Atleta';
      final pay = booking?.paymentShortLabel ?? '';
      final amount = booking?.amountReais;
      final money = amount != null
          ? NumberFormat.currency(locale: 'pt_BR', symbol: r'R$').format(amount)
          : (slot.priceReais != null
                ? NumberFormat.currency(
                    locale: 'pt_BR',
                    symbol: r'R$',
                  ).format(slot.priceReais)
                : '');
      final parts = <String>[name];
      if (pay.isNotEmpty && money.isNotEmpty) {
        parts.add('$pay $money');
      } else if (money.isNotEmpty) {
        parts.add(money);
      }
      return Text(parts.join(' · '), style: muted, maxLines: 2);
    }

    if (slot.isBlocked) {
      final reason = slot.blockReason?.displayLabel ?? 'Bloqueado';
      final note = slot.blockNote?.trim();
      final text = note != null && note.isNotEmpty ? '$reason — $note' : reason;
      return Text(text, style: muted, maxLines: 2);
    }

    final price = slot.priceReais;
    final base = slot.basePriceReais;
    final priceStr = price != null
        ? NumberFormat.currency(locale: 'pt_BR', symbol: r'R$').format(price)
        : null;
    final baseStr = base != null && slot.hasPromotion
        ? NumberFormat.currency(locale: 'pt_BR', symbol: r'R$').format(base)
        : null;

    if (slot.hasPromotion && priceStr != null && baseStr != null) {
      return Text.rich(
        TextSpan(
          children: [
            TextSpan(text: '$priceStr ', style: muted),
            TextSpan(
              text: baseStr,
              style: muted?.copyWith(
                decoration: TextDecoration.lineThrough,
                color: AppColors.onSurfaceMuted.withValues(alpha: 0.55),
              ),
            ),
          ],
        ),
        maxLines: 2,
      );
    }
    if (row.isPeakHour && priceStr != null) {
      return Text(
        'Sugerir $priceStr · horário forte',
        style: muted,
        maxLines: 2,
      );
    }
    if (priceStr != null) {
      return Text(priceStr, style: muted);
    }
    return const SizedBox.shrink();
  }
}
