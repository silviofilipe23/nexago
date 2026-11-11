import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../athlete/domain/arena_review.dart';
import 'arena_detail_review_card.dart';

class ArenaDetailReviewsSection extends StatelessWidget {
  const ArenaDetailReviewsSection({
    super.key,
    required this.reviews,
    required this.onViewAll,
    required this.now,
  });

  final List<ArenaReview> reviews;
  final VoidCallback? onViewAll;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final top = reviews.take(5).toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text(
              'Avaliações',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
                letterSpacing: -0.3,
              ),
            ),
            Spacer(),
            if (onViewAll != null && reviews.isNotEmpty)
              TextButton(
                onPressed: onViewAll,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.brand,
                  padding: EdgeInsets.zero,
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(
                  'ver todas',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
          ],
        ),
        SizedBox(height: 12),
        if (top.isEmpty)
          Text(
            'Ainda não há avaliações para esta arena.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: context.themeColors.onSurfaceMuted,
            ),
          )
        else
          ...[
            for (var i = 0; i < top.length; i++) ...[
              if (i > 0) SizedBox(height: 10),
              ArenaDetailReviewCard(review: top[i], now: now),
            ],
          ],
      ],
    );
  }
}
