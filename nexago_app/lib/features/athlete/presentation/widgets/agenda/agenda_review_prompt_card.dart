import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/observability/analytics_log.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/arena_review.dart';
import '../../../domain/arena_review_providers.dart';
import '../arena_review/arena_review_widgets.dart';

/// Convite "Como foi jogar na arena?" no topo da Agenda (canvas "Avaliação da arena
/// depois do horário" 01): a reserva concluída mais recente que ainda não foi avaliada.
/// Tocar numa estrela abre a tela já com a nota; "Agora não" vale para aquela reserva
/// também depois de reabrir o app.
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
        onRate: (rating) =>
            openArenaReview(context, pending.bookingId, rating: rating),
        onDismiss: () {
          logAnalytics(ref, (a) => a.logArenaReviewPromptDismissed());
          unawaited(dismissArenaReviewPrompt(ref, pending.bookingId));
        },
      ),
    );
  }
}

class AgendaReviewPromptView extends StatelessWidget {
  const AgendaReviewPromptView({
    super.key,
    required this.pending,
    required this.onRate,
    required this.onDismiss,
  });

  final PendingArenaReview pending;

  /// Estrela tocada (1 a 5): abre a tela de avaliar com ela marcada.
  final ValueChanged<int> onRate;
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
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.5,
                    color: colors.brandText,
                  ),
                ),
              ),
              const ArenaReviewXpChip(),
              // "Agora não" como fechar: a linha das estrelas fica livre para os
              // cinco alvos de 44 px mesmo em tela estreita.
              IconButton(
                key: const ValueKey('agenda-review-dismiss'),
                onPressed: onDismiss,
                tooltip: 'Agora não',
                visualDensity: VisualDensity.compact,
                constraints:
                    const BoxConstraints.tightFor(width: 44, height: 44),
                icon: Icon(Icons.close_rounded,
                    size: 20, color: colors.onSurfaceMuted),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Como foi jogar na $arena?',
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
          const SizedBox(height: 8),
          Row(
            children: [
              for (var star = 1; star <= 5; star++)
                _PromptStar(star: star, onTap: () => onRate(star)),
            ],
          ),
          Text(
            'Toque numa estrela para avaliar',
            style: TextStyle(fontSize: 12, color: colors.onSurfaceMuted),
          ),
        ],
      ),
    );
  }
}

/// Estrela vazia de 44 px no cartão: o toque já é a nota.
class _PromptStar extends StatelessWidget {
  const _PromptStar({required this.star, required this.onTap});

  final int star;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Dar nota $star de 5',
      excludeSemantics: true,
      child: InkResponse(
        key: ValueKey('agenda-review-star-$star'),
        onTap: onTap,
        radius: 24,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            Icons.star_outline_rounded,
            size: 30,
            color: context.themeColors.brandText,
          ),
        ),
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
