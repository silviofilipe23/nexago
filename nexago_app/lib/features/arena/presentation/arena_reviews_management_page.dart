import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:math' as math;

import '../../../core/auth/auth_providers.dart';
import '../../../core/layout/app_scaffold.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/success_page.dart';
import '../domain/arena_schedule_providers.dart';
import '../domain/review_reply_providers.dart';
import 'widgets/reply_review_dialog.dart';

class ArenaReviewsManagementPage extends ConsumerStatefulWidget {
  const ArenaReviewsManagementPage({super.key});

  @override
  ConsumerState<ArenaReviewsManagementPage> createState() =>
      _ArenaReviewsManagementPageState();
}

class _ArenaReviewsManagementPageState
    extends ConsumerState<ArenaReviewsManagementPage> {
  static const int _pageSize = 10;
  int _visibleCount = _pageSize;

  @override
  Widget build(BuildContext context) {
    final reviewsAsync = ref.watch(managedArenaReviewsProvider);
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
    final managerId = ref.watch(authProvider).valueOrNull?.uid ?? '';
    final replyService = ref.watch(reviewReplyServiceProvider);
    final theme = Theme.of(context);

    return AppScaffold(
      title: 'Reputação',
      body: reviewsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stackTrace) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o histórico de reputação.',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ),
        ),
        data: (reviews) {
          if (reviews.isEmpty) {
            return const Center(
              child: Text('Ainda não há avaliações registradas.'),
            );
          }

          final visible = reviews.take(_visibleCount).toList(growable: false);
          final hasMore = reviews.length > visible.length;

          return ListView.separated(
            key: const PageStorageKey<String>('arena-reviews-management-scroll'),
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
            itemCount: visible.length + 1,
            separatorBuilder: (context, index) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              if (index == visible.length) {
                if (!hasMore) {
                  return const Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: Center(
                      child: Text(
                        'Você chegou ao fim do histórico.',
                        style: TextStyle(color: AppColors.onSurfaceMuted),
                      ),
                    ),
                  );
                }
                return Center(
                  child: OutlinedButton(
                    onPressed: () {
                      setState(() {
                        _visibleCount += _pageSize;
                      });
                    },
                    child: const Text('Ver mais'),
                  ),
                );
              }

              final review = visible[index];
              final isNegative = review.rating <= 2;
              final hasReply = review.reply != null;
              final canReply = arenaId.isNotEmpty && managerId.isNotEmpty;
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: isNegative
                      ? const Color(0xFFFFEBEE)
                      : theme.colorScheme.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isNegative
                        ? const Color(0xFFFFCDD2)
                        : theme.colorScheme.outline.withValues(alpha: 0.12),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          '⭐ ${review.rating}',
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            review.athleteName ?? 'Atleta',
                            style: theme.textTheme.labelLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        if (isNegative)
                          const Text(
                            'Prioridade alta',
                            style: TextStyle(
                              color: Color(0xFFC62828),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                      ],
                    ),
                    if ((review.comment ?? '').trim().isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(review.comment!),
                    ],
                    if (hasReply) ...[
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF5F5F5),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text('🏟️ Resposta da arena\n${review.reply!.message}'),
                      ),
                    ],
                    const SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerRight,
                      child: OutlinedButton(
                        onPressed: !canReply
                            ? null
                            : () async {
                                final text = await showReplyReviewDialog(
                                  context,
                                  originalComment: review.comment ?? '',
                                  rating: review.rating,
                                  initialValue: review.reply?.message,
                                );
                                if (text == null) return;
                                try {
                                  if (review.reply == null) {
                                    await replyService.replyToReview(
                                      reviewId: review.id,
                                      arenaId: arenaId,
                                      managerUserId: managerId,
                                      message: text,
                                    );
                                  } else {
                                    await replyService.updateReviewReply(
                                      reviewId: review.id,
                                      arenaId: arenaId,
                                      managerUserId: managerId,
                                      message: text,
                                    );
                                  }
                                  if (!context.mounted) return;
                                  final scrollable = Scrollable.maybeOf(context);
                                  final previousOffset =
                                      scrollable?.position.pixels ?? 0;
                                  await Navigator.of(context).push(
                                    MaterialPageRoute<void>(
                                      builder: (_) => const _ReviewReplySuccessPage(),
                                    ),
                                  );
                                  WidgetsBinding.instance
                                      .addPostFrameCallback((_) {
                                    final position = scrollable?.position;
                                    if (position == null || !position.hasPixels) {
                                      return;
                                    }
                                    final target = math.min(
                                      previousOffset,
                                      position.maxScrollExtent,
                                    );
                                    position.jumpTo(target);
                                  });
                                } catch (e) {
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text('Erro ao salvar resposta: $e'),
                                    ),
                                  );
                                }
                              },
                        child: Text(hasReply ? 'Editar resposta' : 'Responder'),
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
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
      primaryActionLabel: 'Voltar',
      onPrimaryAction: () => Navigator.of(context).pop(),
    );
  }
}
