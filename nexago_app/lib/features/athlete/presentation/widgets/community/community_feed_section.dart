import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/nexa_card.dart';
import '../../../../../core/ui/nexa_skeleton.dart';
import '../../../domain/community/community_feed_providers.dart';

/// Máximo de categorias campeãs listadas por item (paridade com o portal:
/// o resto vira "+N categorias").
const _championsPreviewLimit = 3;

/// Feed da Comunidade no padrão do painel web: linhas com badge de ícone por
/// tipo (inscrições abertas / campeões / aviso), hora relativa e detalhe dos
/// campeões. Feed automático (Cloud Function, sem UGC).
class CommunityFeedSection extends ConsumerWidget {
  const CommunityFeedSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feedAsync = ref.watch(communityFeedProvider);

    if (feedAsync.isLoading && !feedAsync.hasValue) {
      return const Column(
        children: [
          NexaSkeleton(height: 74, radius: AppRadii.lgAll),
          SizedBox(height: 10),
          NexaSkeleton(height: 74, radius: AppRadii.lgAll),
        ],
      );
    }

    final items = feedAsync.valueOrNull ?? const [];
    if (items.isEmpty) return const _CommunityFeedEmpty();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _CommunityFeedRow(item: items[i]),
        ],
      ],
    );
  }
}

class _CommunityFeedEmpty extends StatelessWidget {
  const _CommunityFeedEmpty();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(
        vertical: AppSpacing.xxl + 2,
        horizontal: AppSpacing.lg,
      ),
      decoration: BoxDecoration(
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: colors.outline.withValues(alpha: 0.4)),
      ),
      child: Text(
        'Sem novidades por enquanto — aberturas de inscrição e campeões de '
        'torneios aparecem aqui automaticamente.',
        textAlign: TextAlign.center,
        style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
      ),
    );
  }
}

class _CommunityFeedRow extends StatelessWidget {
  const _CommunityFeedRow({required this.item});

  final CommunityFeedItem item;

  static ({IconData icon, Color color}) _badgeOf(CommunityFeedItem item) {
    return switch (item.type) {
      CommunityFeedType.tournamentChampions => (
          icon: Icons.emoji_events_outlined,
          color: AppColors.pending,
        ),
      CommunityFeedType.organizerAnnouncement => (
          icon: Icons.campaign_rounded,
          color: AppColors.pending,
        ),
      _ => (icon: Icons.calendar_month_outlined, color: AppColors.brand),
    };
  }

  static String _messageOf(CommunityFeedItem item) {
    switch (item.type) {
      case CommunityFeedType.tournamentOpen:
        final cats = item.categoriesCount > 0
            ? '${item.categoriesCount} '
                'categoria${item.categoriesCount == 1 ? '' : 's'}'
            : 'inscrições abertas';
        final place = item.city.isNotEmpty ? item.city : item.locationName;
        return 'Inscrições abertas · $cats'
            '${place.isNotEmpty ? ' — $place' : ''}';
      case CommunityFeedType.tournamentChampions:
        return 'Torneio encerrado — confira os campeões:';
      case CommunityFeedType.organizerAnnouncement:
      case CommunityFeedType.unknown:
        return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final badge = _badgeOf(item);
    final message = _messageOf(item);
    final isAnnouncement =
        item.type == CommunityFeedType.organizerAnnouncement;
    final champions = item.type == CommunityFeedType.tournamentChampions
        ? item.champions
        : const <CommunityFeedChampion>[];

    return NexaCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      onTap: item.tournamentId.isEmpty
          ? null
          : () => context.pushNamed(
                AppRouteNames.tournamentDetail,
                pathParameters: {'tournamentId': item.tournamentId},
              ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: badge.color.withValues(alpha: 0.13),
              borderRadius: AppRadii.mdAll,
            ),
            child: Icon(badge.icon, size: 18, color: badge.color),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Expanded(
                      child: Text(
                        item.tournamentName,
                        style: AppTypography.titleS
                            .copyWith(color: colors.onSurface),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    if (item.createdAt != null)
                      Text(
                        communityFeedRelativeTime(item.createdAt!),
                        style: AppTypography.monoMeta
                            .copyWith(color: colors.onSurfaceMuted),
                      ),
                  ],
                ),
                if (message.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    message,
                    style: AppTypography.bodyS
                        .copyWith(color: colors.onSurfaceMuted),
                  ),
                ],
                // Aviso do organizador é tipo só do app (o portal não tem) —
                // a caixa destacada preserva a leitura de "recado oficial".
                if (isAnnouncement && item.message.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.sm + 2),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(AppSpacing.sm + 2),
                    decoration: BoxDecoration(
                      color: badge.color.withValues(alpha: 0.10),
                      borderRadius: AppRadii.smAll,
                      border: Border.all(
                        color: badge.color.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Text(
                      item.message,
                      style: AppTypography.bodyS.copyWith(
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                ],
                if (champions.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.sm),
                  for (final champion
                      in champions.take(_championsPreviewLimit))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Text.rich(
                        TextSpan(
                          children: [
                            if (champion.categoryName.isNotEmpty)
                              TextSpan(
                                text: '${champion.categoryName}: ',
                                style: AppTypography.bodyS.copyWith(
                                  fontWeight: FontWeight.w600,
                                  color: colors.onSurface,
                                ),
                              ),
                            TextSpan(
                              text: champion.playersLabel,
                              style: AppTypography.bodyS
                                  .copyWith(color: colors.onSurfaceMuted),
                            ),
                          ],
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  if (champions.length > _championsPreviewLimit)
                    Text(
                      '+${champions.length - _championsPreviewLimit} categorias',
                      style: AppTypography.bodyS
                          .copyWith(color: colors.onSurfaceMuted),
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
