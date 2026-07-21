import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/community/community_feed_providers.dart';

/// Seção "Últimas da comunidade" — feed automático (torneios abertos,
/// campeões). Renderiza nada enquanto o feed está vazio.
class CommunityFeedSection extends ConsumerWidget {
  const CommunityFeedSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feedAsync = ref.watch(communityFeedProvider);
    final items = feedAsync.valueOrNull ?? const [];
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 28),
        Text(
          'Últimas da comunidade',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
        ),
        const SizedBox(height: 12),
        for (final item in items) ...[
          _CommunityFeedCard(item: item),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _CommunityFeedCard extends StatelessWidget {
  const _CommunityFeedCard({required this.item});

  final CommunityFeedItem item;

  static String _formatDate(DateTime date) {
    final dd = date.day.toString().padLeft(2, '0');
    final mm = date.month.toString().padLeft(2, '0');
    return '$dd/$mm';
  }

  @override
  Widget build(BuildContext context) {
    final isChampions = item.type == CommunityFeedType.tournamentChampions;
    final isAnnouncement =
        item.type == CommunityFeedType.organizerAnnouncement;
    final badge = isChampions
        ? 'CAMPEÕES'
        : isAnnouncement
            ? 'AVISO DO ORGANIZADOR'
            : 'INSCRIÇÕES ABERTAS';
    final icon = isChampions
        ? Icons.emoji_events_rounded
        : Icons.campaign_rounded;
    final accentColor = isAnnouncement ? Colors.amber : AppColors.brand;
    final subtitleParts = [
      if (item.city.isNotEmpty) item.city,
      if (item.startAt != null) _formatDate(item.startAt!),
      if (!isChampions && !isAnnouncement && item.categoriesCount > 0)
        '${item.categoriesCount} categorias',
    ];

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: () => context.pushNamed(
          AppRouteNames.tournamentDetail,
          pathParameters: {'tournamentId': item.tournamentId},
        ),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: context.themeColors.surfaceRaised),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: accentColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(icon, size: 18, color: accentColor),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          badge,
                          style: AppTypography.mono(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: accentColor,
                            letterSpacing: 0.8,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          item.tournamentName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (item.createdAt != null)
                    Text(
                      communityFeedRelativeTime(item.createdAt!),
                      style: TextStyle(
                        fontSize: 11,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                ],
              ),
              if (subtitleParts.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  subtitleParts.join(' · '),
                  style: TextStyle(
                    fontSize: 12,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
              if (isAnnouncement && item.message.isNotEmpty) ...[
                const SizedBox(height: 10),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: accentColor.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: accentColor.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Text(
                    item.message,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.4,
                      fontWeight: FontWeight.w600,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                ),
              ],
              if (isChampions && item.champions.isNotEmpty) ...[
                const SizedBox(height: 10),
                for (final champion in item.champions)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.workspace_premium_rounded,
                          size: 15,
                          color: AppColors.brand,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text.rich(
                            TextSpan(
                              children: [
                                if (champion.categoryName.isNotEmpty)
                                  TextSpan(
                                    text: '${champion.categoryName} · ',
                                    style: TextStyle(
                                      color:
                                          context.themeColors.onSurfaceMuted,
                                    ),
                                  ),
                                TextSpan(
                                  text: champion.playersLabel,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: context.themeColors.onSurface,
                                  ),
                                ),
                              ],
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
