import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../athlete/domain/arena_review.dart';
import '../../../../athlete/domain/arena_review_providers.dart';
import '../../../../athlete/presentation/widgets/arena_review/arena_review_widgets.dart';
import '../my_bookings_logic.dart';

/// Convite "Como foi o jogo?" no topo de Minhas reservas (canvas "Avaliação da arena
/// depois do horário" 01): a reserva concluída mais recente que ainda não foi avaliada.
class MyBookingsReviewPromptCard extends ConsumerWidget {
  const MyBookingsReviewPromptCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingReviewProvider).valueOrNull;
    if (pending == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
      child: MyBookingsReviewPromptView(
        pending: pending,
        onReview: () => openArenaReview(context, pending.bookingId),
        onDismiss: () => ref
            .read(dismissedArenaReviewsProvider.notifier)
            .update((ids) => {...ids, pending.bookingId}),
      ),
    );
  }
}

class MyBookingsReviewPromptView extends StatelessWidget {
  const MyBookingsReviewPromptView({
    super.key,
    required this.pending,
    required this.onReview,
    required this.onDismiss,
  });

  final PendingArenaReview pending;
  final VoidCallback onReview;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final arena =
        pending.arenaName.trim().isEmpty ? 'arena' : pending.arenaName.trim();
    final day = relativeBookingDayLabel(pending.dateRaw).toUpperCase();
    final time = [pending.startTime, pending.endTime]
        .where((t) => t.trim().isNotEmpty)
        .join(' – ');
    final subtitle =
        [pending.courtName.trim(), time].where((p) => p.isNotEmpty).join(' · ');

    return Container(
      key: const ValueKey('my-bookings-review-prompt'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0, 0.62],
          colors: [AppColors.brand.withValues(alpha: 0.10), colors.surfaceCard],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  day.isEmpty
                      ? 'RESERVA CONCLUÍDA'
                      : 'RESERVA CONCLUÍDA · $day',
                  style: AppTypography.mono(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.5,
                    color: colors.brandText,
                  ),
                ),
              ),
              const ArenaReviewXpChip(),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Como foi o jogo na $arena?',
            style: AppTypography.soraRegular(
              fontSize: 18,
              height: 1.25,
              color: colors.onSurface,
            ),
          ),
          if (subtitle.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 44,
                  child: FilledButton.icon(
                    key: const ValueKey('my-bookings-review-open'),
                    onPressed: onReview,
                    icon: const Icon(Icons.star_rounded, size: 18),
                    label: const Text(
                      'Avaliar agora',
                      style:
                          TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                height: 44,
                child: TextButton(
                  key: const ValueKey('my-bookings-review-dismiss'),
                  onPressed: onDismiss,
                  style: TextButton.styleFrom(
                      foregroundColor: colors.onSurfaceMuted),
                  child: const Text(
                    'Agora não',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
