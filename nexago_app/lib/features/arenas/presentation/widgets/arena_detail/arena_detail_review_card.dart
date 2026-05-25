import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../athlete/domain/arena_review.dart';
import '../../../domain/arena_detail_logic.dart';

class ArenaDetailReviewCard extends StatelessWidget {
  const ArenaDetailReviewCard({
    super.key,
    required this.review,
    required this.now,
  });

  final ArenaReview review;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = (review.athleteName?.trim().isNotEmpty == true)
        ? review.athleteName!.trim()
        : 'Atleta';
    final age = formatRelativeReviewAge(review.createdAt, now);
    final comment = review.comment?.trim() ?? '';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.surfaceRaised),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: const Color(0xFF7C4DFF),
                child: Text(
                  reviewerInitials(name),
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: AppColors.white,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurface,
                      ),
                    ),
                    if (age.isNotEmpty)
                      Text(
                        age,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.onSurfaceMuted,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: List.generate(5, (i) {
              final filled = i < review.rating;
              return Icon(
                filled ? Icons.star_rounded : Icons.star_outline_rounded,
                size: 16,
                color: filled ? AppColors.pending : AppColors.surfaceRaised,
              );
            }),
          ),
          if (comment.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              comment,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.onSurface,
                height: 1.45,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
