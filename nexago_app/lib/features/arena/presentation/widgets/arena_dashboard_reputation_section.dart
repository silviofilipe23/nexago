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
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Reputação',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            SizedBox(height: 20),
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
                      color: context.themeColors.onSurface,
                      height: 1,
                    ),
                  ),
                  SizedBox(width: 20),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${m.repliedPercent.toStringAsFixed(0)}% respondidas',
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                        SizedBox(height: 8),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: (m.repliedPercent / 100).clamp(0.0, 1.0),
                            minHeight: 6,
                            backgroundColor: context.themeColors.surfaceRaised,
                            color: AppColors.brand,
                          ),
                        ),
                        SizedBox(height: 10),
                        Text(
                          'Tempo médio: ${m.averageReplyHours.toStringAsFixed(1)}h • meta 6h',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(height: 20),
            Row(
              children: [
                Text(
                  'Pendentes de resposta',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                Spacer(),
                TextButton(
                  onPressed: () =>
                      context.pushNamed(AppRouteNames.arenaManagerReviews),
                  child: Text('Ver todas'),
                ),
              ],
            ),
            SizedBox(height: 8),
            pendingReviewsAsync.when(
              loading: () => Center(
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
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  review.athleteName ?? 'Atleta',
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
            ],
          ),
          if ((review.comment ?? '').trim().isNotEmpty) ...[
            SizedBox(height: 8),
            Text(
              review.comment!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          SizedBox(height: 12),
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
                  child: Text('Responder'),
                ),
              ),
              SizedBox(width: 8),
              IconButton.filled(
                onPressed: !canReply
                    ? null
                    : () => _reply(context, quick: true),
                style: IconButton.styleFrom(
                  backgroundColor: context.themeColors.surfaceSheet,
                  foregroundColor: AppColors.brand,
                ),
                icon: Icon(Icons.bolt_rounded),
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
