import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/arena_review.dart';
import '../../../domain/arena_review_providers.dart';
import '../arena_review/arena_review_widgets.dart';

/// Convite "Como foi o jogo?" no topo da Agenda (canvas "Avaliação da arena
/// depois do horário" 01): a reserva concluída mais recente que ainda não foi avaliada.
class AgendaReviewPromptCard extends ConsumerWidget {
  const AgendaReviewPromptCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingReviewProvider).valueOrNull;
    if (pending == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
      child: AgendaReviewPromptView(
        pending: pending,
        onReview: () => openArenaReview(context, pending.bookingId),
        onDismiss: () => ref
            .read(dismissedArenaReviewsProvider.notifier)
            .update((ids) => {...ids, pending.bookingId}),
      ),
    );
  }
}

class AgendaReviewPromptView extends StatelessWidget {
  const AgendaReviewPromptView({
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
    final day = _relativeDayLabel(pending.dateRaw);
    final time = [pending.startTime, pending.endTime]
        .where((t) => t.trim().isNotEmpty)
        .join(' – ');
    final subtitle =
        [pending.courtName.trim(), time].where((p) => p.isNotEmpty).join(' · ');

    return Container(
      key: const ValueKey('agenda-review-prompt'),
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
                    key: const ValueKey('agenda-review-open'),
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
                  key: const ValueKey('agenda-review-dismiss'),
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

/// "HOJE", "ONTEM" ou "HÁ N DIAS" (a reserva do convite sempre já passou).
String _relativeDayLabel(String dateRaw, {DateTime? now}) {
  final date =
      dateRaw.length >= 10 ? DateTime.tryParse(dateRaw.substring(0, 10)) : null;
  if (date == null) return '';
  final clock = now ?? DateTime.now();
  final diff = DateTime(clock.year, clock.month, clock.day)
      .difference(DateTime(date.year, date.month, date.day))
      .inDays;
  if (diff <= 0) return 'HOJE';
  if (diff == 1) return 'ONTEM';
  return 'HÁ $diff DIAS';
}
