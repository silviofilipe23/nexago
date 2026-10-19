import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import 'booking_success_action_tile.dart';

class BookingSuccessActionGrid extends StatelessWidget {
  const BookingSuccessActionGrid({
    super.key,
    required this.onStory,
    required this.onShare,
    required this.onDirections,
  });

  final VoidCallback onStory;
  final VoidCallback onShare;
  final VoidCallback onDirections;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _StoryTile(onTap: onStory),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: BookingSuccessActionTile(
                icon: Icons.ios_share_rounded,
                label: 'Compartilhar',
                onTap: onShare,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: BookingSuccessActionTile(
                icon: Icons.near_me_outlined,
                label: 'Como chegar',
                onTap: onDirections,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Atalho de destaque para o editor do story — largura inteira, acima das
/// duas ações de sempre.
class _StoryTile extends StatelessWidget {
  const _StoryTile({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Material(
      color: colors.surfaceRaised,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        key: const Key('booking-success-story'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.amp_stories_outlined,
                  color: AppColors.brand,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Postar no story',
                      style: theme.textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Chame a galera pro jogo',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: colors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
