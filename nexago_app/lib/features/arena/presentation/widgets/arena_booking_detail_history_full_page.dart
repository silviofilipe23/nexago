import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_manager_booking.dart';
import '../../domain/arena_slot_detail_providers.dart';
import 'arena_async_state.dart';

/// Lista completa do histórico do atleta na arena.
class ArenaBookingDetailHistoryFullPage extends ConsumerWidget {
  const ArenaBookingDetailHistoryFullPage({
    super.key,
    required this.athleteId,
    required this.arenaId,
  });

  final String athleteId;
  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(
      athleteArenaHistoryProvider(
        AthleteArenaHistoryArgs(
          athleteId: athleteId,
          arenaId: arenaId,
        ),
      ),
    );
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        title: const Text('Histórico completo'),
      ),
      body: historyAsync.when(
        data: (bookings) {
          if (bookings.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text('Sem histórico para este atleta nesta arena.'),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
            itemCount: bookings.length,
            separatorBuilder: (_, __) => Divider(
              height: 18,
              color: AppColors.onSurfaceMuted.withValues(alpha: 0.15),
            ),
            itemBuilder: (_, i) => _HistoryBookingRow(booking: bookings[i]),
          );
        },
        loading: () => const Center(
          child: ArenaLoadingState(label: 'Carregando histórico...'),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o histórico.\n$e',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}

class _HistoryBookingRow extends StatelessWidget {
  const _HistoryBookingRow({required this.booking});

  final ArenaManagerBooking booking;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final date = DateTime.tryParse(
      booking.dateKey.length >= 10 ? booking.dateKey.substring(0, 10) : '',
    );
    final dateLabel = date != null
        ? DateFormat('dd/MM/yyyy', 'pt_BR').format(date)
        : booking.dateKey;
    final status = arenaBookingBusinessStatusLabel(booking.data);
    final statusColor = _statusAccentColor(status);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                dateLabel,
                style: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurface,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '${booking.startTime} – ${booking.endTime}',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: statusColor.withValues(alpha: 0.35)),
          ),
          child: Text(
            status,
            style: theme.textTheme.labelMedium?.copyWith(
              color: statusColor.withValues(alpha: 0.95),
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}

Color _statusAccentColor(String statusLabel) {
  final s = statusLabel.toLowerCase();
  if (s.contains('cancel')) return const Color(0xFF9E9E9E);
  if (s.contains('ativa')) return AppColors.win;
  if (s.contains('conclu')) return const Color(0xFF1565C0);
  return AppColors.brand;
}
