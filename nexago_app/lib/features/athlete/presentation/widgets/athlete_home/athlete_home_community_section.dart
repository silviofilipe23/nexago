import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/profiles/app_user_profile.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/text/safe_display_text.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/nexa_card.dart';
import '../../../domain/community/community_feed_providers.dart';
import 'athlete_home_section_header.dart';

const _previewLimit = 4;

/// Seção "Comunidade" da Home (paridade com o painel web): últimos itens do
/// feed em linhas compactas, com "Ver tudo" levando pra aba Comunidade.
/// Falha ou feed vazio some em silêncio — lista vazia é estado válido.
class AthleteHomeCommunitySection extends ConsumerWidget {
  const AthleteHomeCommunitySection({super.key, required this.onViewAll});

  final VoidCallback onViewAll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(communityFeedProvider).valueOrNull ?? const [];
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AthleteHomeSectionHeader(
          title: 'Comunidade',
          trailingLabel: 'VER TUDO',
          onTrailingTap: onViewAll,
        ),
        const SizedBox(height: 10),
        NexaCard(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.sm,
          ),
          child: Column(
            children: [
              for (final item in items.take(_previewLimit))
                _CommunityRow(item: item),
            ],
          ),
        ),
      ],
    );
  }
}

class _CommunityRow extends StatelessWidget {
  const _CommunityRow({required this.item});

  final CommunityFeedItem item;

  static String _initialsOf(String name) {
    final initials = initialsFromDisplayName(name);
    return initials == '?' ? 'NX' : initials;
  }

  static double _hueOf(String text) {
    var hash = 0;
    for (final unit in text.codeUnits) {
      hash = (hash * 31 + unit) % 360;
    }
    return hash.toDouble();
  }

  static String _messageOf(CommunityFeedItem item) {
    switch (item.type) {
      case CommunityFeedType.tournamentOpen:
        final cats = item.categoriesCount > 0
            ? ' · ${item.categoriesCount} '
                'categoria${item.categoriesCount == 1 ? '' : 's'}'
            : '';
        final place =
            item.city.isNotEmpty ? item.city : item.locationName;
        return 'abriu inscrições$cats${place.isNotEmpty ? ' — $place' : ''}.';
      case CommunityFeedType.tournamentChampions:
        final count = item.champions.length;
        return count > 0
            ? 'definiu os campeões de $count '
                'categoria${count == 1 ? '' : 's'}.'
            : 'terminou com campeões definidos.';
      case CommunityFeedType.organizerAnnouncement:
      case CommunityFeedType.unknown:
        return item.message;
    }
  }

  static String _relativeTime(DateTime? date, DateTime now) {
    if (date == null) return 'agora';
    final minutes = now.difference(date).inMinutes;
    if (minutes < 1) return 'agora';
    if (minutes < 60) return 'há $minutes min';
    final hours = (minutes / 60).round();
    if (hours < 24) return 'há $hours h';
    final days = (hours / 24).round();
    if (days == 1) return 'ontem';
    return 'há $days dias';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final title = sanitizeUtf16(item.tournamentName);
    final hue = _hueOf(title);

    return InkWell(
      onTap: item.tournamentId.isEmpty
          ? null
          : () => context.pushNamed(
                AppRouteNames.tournamentDetail,
                pathParameters: {'tournamentId': item.tournamentId},
              ),
      borderRadius: BorderRadius.circular(AppSpacing.sm),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    HSLColor.fromAHSL(1, hue, 0.6, 0.45).toColor(),
                    HSLColor.fromAHSL(1, (hue + 30) % 360, 0.6, 0.28)
                        .toColor(),
                  ],
                ),
              ),
              child: Text(
                _initialsOf(title),
                style: AppTypography.mono(
                  fontSize: 11,
                  color: Colors.white,
                  height: 1,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: title,
                      style: AppTypography.bodyS.copyWith(
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    TextSpan(
                      text: ' ${sanitizeUtf16(_messageOf(item))}',
                      style: AppTypography.bodyS
                          .copyWith(color: colors.onSurfaceMuted),
                    ),
                  ],
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Text(
              _relativeTime(item.createdAt, DateTime.now()),
              style: AppTypography.monoMeta
                  .copyWith(color: colors.onSurfaceMuted),
            ),
          ],
        ),
      ),
    );
  }
}
