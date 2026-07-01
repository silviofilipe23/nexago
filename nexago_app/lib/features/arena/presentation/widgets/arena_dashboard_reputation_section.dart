import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'dart:math' as math;

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/success_page.dart';
import '../../../athlete/domain/arena_review.dart';
import '../../../arenas/domain/arena_detail_logic.dart';
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

    final pendingCount = pendingReviewsAsync.maybeWhen(
      data: (reviews) => reviews.length,
      orElse: () => 0,
    );

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            metricsAsync.when(
              loading: () => const LinearProgressIndicator(minHeight: 2),
              error: (e, _) => Text(
                'Não foi possível carregar métricas de reputação.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
              data: (m) => _ReputationSummary(
                averageRating: averageRating,
                metrics: m,
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Text(
                  'Pendentes de resposta',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                if (pendingCount > 0) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.brand,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '$pendingCount',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: AppColors.black,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
                const Spacer(),
                TextButton(
                  onPressed: () =>
                      context.pushNamed(AppRouteNames.arenaManagerReviews),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.brand,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(
                    'VER TODAS',
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            pendingReviewsAsync.when(
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
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
                      color: context.themeColors.onSurfaceMuted,
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

class _ReputationSummary extends StatelessWidget {
  const _ReputationSummary({
    required this.averageRating,
    required this.metrics,
  });

  final double averageRating;
  final ArenaReviewReputationMetrics metrics;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final replyLabel = _replyRateLabel(metrics.repliedPercent);
    final replyColor = _replyRateColor(replyLabel);
    final hoursLabel = metrics.averageReplyHours > 0
        ? '${metrics.averageReplyHours.toStringAsFixed(1).replaceAll('.', ',')}h'
        : '—';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Reputação',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            const Spacer(),
            if (averageRating > 0) ...[
              Text(
                averageRating.toStringAsFixed(1),
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                  height: 1,
                ),
              ),
              const SizedBox(width: 6),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(
                  5,
                  (i) => Icon(
                    i < averageRating.round().clamp(0, 5)
                        ? Icons.star_rounded
                        : Icons.star_outline_rounded,
                    size: 18,
                    color: AppColors.brand,
                  ),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 16),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${metrics.repliedPercent.toStringAsFixed(0)}% respondidas',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: (metrics.repliedPercent / 100)
                                .clamp(0.0, 1.0),
                            minHeight: 6,
                            backgroundColor:
                                context.themeColors.surfaceRaised,
                            color: AppColors.brand,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        replyLabel,
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: replyColor,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  hoursLabel,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    height: 1,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'meta 6h',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }

  static String _replyRateLabel(double percent) {
    if (percent >= 80) return 'alto';
    if (percent >= 50) return 'médio';
    return 'baixo';
  }

  static Color _replyRateColor(String label) {
    return switch (label) {
      'alto' => AppColors.win,
      'médio' => AppColors.pending,
      _ => AppColors.brand,
    };
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
    final age = formatRelativeReviewAge(review.createdAt, DateTime.now());
    final comment = (review.comment ?? '').trim();

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(
                  5,
                  (i) => Icon(
                    i < review.rating
                        ? Icons.star_rounded
                        : Icons.star_outline_rounded,
                    size: 14,
                    color: AppColors.brand,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  review.athleteName ?? 'Atleta',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
              if (age.isNotEmpty) ...[
                const SizedBox(width: 6),
                Text(
                  age,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontSize: 11,
                  ),
                ),
              ],
              const SizedBox(width: 8),
              FilledButton(
                onPressed:
                    !canReply ? null : () => _reply(context, quick: false),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                child: const Text(
                  'Responder',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                ),
              ),
              const SizedBox(width: 6),
              Material(
                color: context.themeColors.surfaceSheet,
                borderRadius: BorderRadius.circular(10),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: !canReply ? null : () => _reply(context, quick: true),
                  child: SizedBox(
                    width: 36,
                    height: 36,
                    child: Icon(
                      Icons.bolt_rounded,
                      size: 18,
                      color: canReply
                          ? AppColors.brand
                          : context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (comment.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              '"$comment"',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurface,
                height: 1.35,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _reply(BuildContext context, {required bool quick}) async {
    final text = await showReplyReviewDialog(
      context,
      originalComment: review.comment ?? '',
      rating: review.rating,
      initialValue: quick
          ? 'Obrigado pelo feedback! Estamos sempre melhorando.'
          : null,
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
