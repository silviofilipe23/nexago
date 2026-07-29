import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/arena_booking_labels.dart';
import '../../../domain/arena_booking_waitlist_entry.dart';
import '../../../domain/waitlist_providers.dart';

/// "Minha lista de espera" — entradas ativas (`waiting`/`notified`) de
/// `arenaBookingWaitlist`. Seção simples dentro de Minhas reservas; some
/// quando não há entrada ativa.
class MyBookingsWaitlistSection extends ConsumerWidget {
  const MyBookingsWaitlistSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = ref.watch(myWaitlistStreamProvider).valueOrNull ?? const [];
    final active = entries.where((e) => e.isActive).toList();
    if (active.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.hourglass_top_rounded, size: 18, color: AppColors.brand),
              SizedBox(width: 8),
              Text(
                'Minha lista de espera',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
          SizedBox(height: 10),
          for (final entry in active) ...[
            _WaitlistEntryCard(entry: entry),
            SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

class _WaitlistEntryCard extends StatefulWidget {
  const _WaitlistEntryCard({required this.entry});

  final ArenaBookingWaitlistEntry entry;

  @override
  State<_WaitlistEntryCard> createState() => _WaitlistEntryCardState();
}

class _WaitlistEntryCardState extends State<_WaitlistEntryCard> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    if (widget.entry.isNotified) {
      // Atualiza a contagem regressiva de 15 min enquanto notificado.
      _ticker = Timer.periodic(const Duration(seconds: 30), (_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final entry = widget.entry;
    final notified = entry.isNotified;
    final accent = notified ? AppColors.win : AppColors.brand;
    final dateLabel = formatBookingDateHeader(entry.dateKey);
    final remaining = entry.remainingNotifyWindow;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withValues(alpha: notified ? 0.5 : 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              notified ? Icons.notifications_active_rounded : Icons.hourglass_top_rounded,
              color: accent,
              size: 20,
            ),
          ),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.arenaName ?? 'Arena',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  [
                    if (entry.courtName != null) entry.courtName,
                    dateLabel,
                    '${entry.startTime}–${entry.endTime}',
                  ].whereType<String>().join(' · '),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  notified
                      ? (remaining != null && remaining > Duration.zero
                          ? 'Vaga liberada! Reserve em até ${_formatRemaining(remaining)}.'
                          : 'Vaga liberada! Reserve agora antes que expire.')
                      : 'Aguardando vaga — avisamos por notificação.',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: accent,
                  ),
                ),
              ],
            ),
          ),
          if (notified) ...[
            SizedBox(width: 8),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.win,
                foregroundColor: AppColors.black,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              onPressed: () => _openSlot(context),
              child: Text('Reservar'),
            ),
          ],
        ],
      ),
    );
  }

  void _openSlot(BuildContext context) {
    final entry = widget.entry;
    context.pushNamed(
      AppRouteNames.arenaSlots,
      pathParameters: {'arenaId': entry.arenaId},
      queryParameters: {
        'date': entry.dateKey,
        'courtId': entry.courtId,
        'startTime': entry.startTime,
      },
    );
  }

  static String _formatRemaining(Duration d) {
    final minutes = d.inMinutes;
    if (minutes < 1) return 'menos de 1 min';
    return '$minutes min';
  }
}
