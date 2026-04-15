import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import '../domain/arena_review_providers.dart';

class ArenaReviewsPage extends ConsumerWidget {
  const ArenaReviewsPage({
    super.key,
    required this.arenaId,
    this.arenaName,
  });

  final String arenaId;
  final String? arenaName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviewsAsync = ref.watch(arenaReviewsStreamProvider(arenaId));
    final title = (arenaName?.trim().isNotEmpty == true)
        ? 'Avaliações • ${arenaName!.trim()}'
        : 'Avaliações';
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: reviewsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Não foi possível carregar.\n$e')),
        data: (reviews) {
          if (reviews.isEmpty) {
            return const Center(child: Text('Ainda não há avaliações.'));
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
            itemCount: reviews.length,
            separatorBuilder: (context, index) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final review = reviews[index];
              final date = review.createdAt;
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: Theme.of(context)
                        .colorScheme
                        .outline
                        .withValues(alpha: 0.12),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Row(
                          children: List.generate(5, (starIndex) {
                            final filled = starIndex < review.rating;
                            return Padding(
                              padding: const EdgeInsets.only(right: 2),
                              child: Icon(
                                filled
                                    ? Icons.star_rounded
                                    : Icons.star_outline_rounded,
                                size: 18,
                                color: filled
                                    ? const Color(0xFFFFC107)
                                    : Theme.of(context).colorScheme.outline,
                              ),
                            );
                          }),
                        ),
                        const Spacer(),
                        if (date != null)
                          Text(
                            DateFormat('dd/MM/yyyy', 'pt_BR').format(date),
                            style: Theme.of(context)
                                .textTheme
                                .labelMedium
                                ?.copyWith(
                                  color: AppColors.onSurfaceMuted,
                                ),
                          ),
                      ],
                    ),
                    if (review.comment != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        review.comment!,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
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
