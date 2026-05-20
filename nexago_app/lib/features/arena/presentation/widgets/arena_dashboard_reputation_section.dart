import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'dart:math' as math;

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/ui/success_page.dart';
import '../../../athlete/domain/arena_review.dart';
import '../../data/review_reply_service.dart';
import '../../domain/arena_providers.dart';
import '../../domain/review_reply_providers.dart';
import 'arena_dashboard_tokens.dart';
import 'reply_review_dialog.dart';

class ArenaDashboardReputationSection extends ConsumerWidget {
  const ArenaDashboardReputationSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final metricsAsync = ref.watch(arenaReviewReputationMetricsProvider);
    final reviewsAsync = ref.watch(managedArenaReviewsProvider);
    final pendingReviewsAsync = ref.watch(managedArenaPendingReviewsProvider);
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
    final managerId = ref.watch(authProvider).valueOrNull?.uid ?? '';
    final replyService = ref.watch(reviewReplyServiceProvider);
    final theme = Theme.of(context);

    final averageRating = reviewsAsync.maybeWhen(
      data: (reviews) {
        if (reviews.isEmpty) return 0.0;
        final sum = reviews.fold<int>(0, (a, r) => a + r.rating);
        return sum / reviews.length;
      },
      orElse: () => 0.0,
    );

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Reputação',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
              ),
            ),
            const SizedBox(height: 20),
            metricsAsync.when(
              loading: () => const LinearProgressIndicator(minHeight: 2),
              error: (e, _) => Text(
                'Não foi possível carregar métricas de reputação.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
              data: (m) => Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    averageRating > 0
                        ? averageRating.toStringAsFixed(1)
                        : '—',
                    style: theme.textTheme.displayMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                      height: 1,
                    ),
                  ),
                  const SizedBox(width: 20),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${m.repliedPercent.toStringAsFixed(0)}% respondidas',
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: AppColors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 8),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: (m.repliedPercent / 100).clamp(0.0, 1.0),
                            minHeight: 6,
                            backgroundColor: AppColors.surfaceRaised,
                            color: AppColors.brand,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'Tempo médio: ${m.averageReplyHours.toStringAsFixed(1)}h • meta 6h',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.onSurfaceMuted,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Text(
                  'Pendentes de resposta',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () =>
                      context.pushNamed(AppRouteNames.arenaManagerReviews),
                  child: const Text('Ver todas'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            pendingReviewsAsync.when(
              loading: () => const Center(
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              error: (e, _) => Text(
                'Não foi possível carregar avaliações.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
              data: (reviews) {
                if (reviews.isEmpty) {
                  return Text(
                    'Nenhuma avaliação pendente de resposta.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.onSurfaceMuted,
                    ),
                  );
                }
                return Column(
                  children: reviews.take(4).map((review) {
                    return _PendingReviewTile(
                      review: review,
                      arenaId: arenaId,
                      managerId: managerId,
                      replyService: replyService,
                    );
                  }).toList(growable: false),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _PendingReviewTile extends StatelessWidget {
  const _PendingReviewTile({
    required this.review,
    required this.arenaId,
    required this.managerId,
    required this.replyService,
  });

  final ArenaReview review;
  final String arenaId;
  final String managerId;
  final ReviewReplyService replyService;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final canReply = arenaId.isNotEmpty && managerId.isNotEmpty;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ...List.generate(
                5,
                (i) => Icon(
                  i < review.rating
                      ? Icons.star_rounded
                      : Icons.star_outline_rounded,
                  size: 16,
                  color: AppColors.brand,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  review.athleteName ?? 'Atleta',
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurface,
                  ),
                ),
              ),
            ],
          ),
          if ((review.comment ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              review.comment!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.onSurfaceMuted,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: !canReply
                      ? null
                      : () => _reply(context, quick: false),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                  ),
                  child: const Text('Responder'),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: !canReply
                    ? null
                    : () => _reply(context, quick: true),
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.surfaceSheet,
                  foregroundColor: AppColors.brand,
                ),
                icon: const Icon(Icons.bolt_rounded),
                tooltip: 'Resposta rápida',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _reply(BuildContext context, {required bool quick}) async {
    final text = await showReplyReviewDialog(
      context,
      originalComment: review.comment ?? '',
      rating: review.rating,
      initialValue: quick ? 'Obrigado pelo feedback! Estamos sempre melhorando.' : null,
    );
    if (text == null) return;
    try {
      await replyService.replyToReview(
        reviewId: review.id,
        arenaId: arenaId,
        managerUserId: managerId,
        message: text,
      );
      if (context.mounted) {
        final scrollable = Scrollable.maybeOf(context);
        final previousOffset = scrollable?.position.pixels ?? 0;
        await Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => const _ReviewReplySuccessPage(),
          ),
        );
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final position = scrollable?.position;
          if (position == null || !position.hasPixels) return;
          final target = math.min(previousOffset, position.maxScrollExtent);
          position.jumpTo(target);
        });
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao salvar resposta: $e')),
        );
      }
    }
  }
}

class _ReviewReplySuccessPage extends StatelessWidget {
  const _ReviewReplySuccessPage();

  @override
  Widget build(BuildContext context) {
    return SuccessPage(
      title: 'Resposta enviada',
      message:
          'Sua resposta foi publicada com sucesso e agora ajuda novos atletas a confiarem ainda mais na arena.',
      primaryActionLabel: 'Voltar ao painel',
      onPrimaryAction: () => Navigator.of(context).pop(),
    );
  }
}
