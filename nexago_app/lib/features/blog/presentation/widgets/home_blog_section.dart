import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../tournaments/presentation/widgets/compete_hub/compete_hub_section_header.dart';
import '../../application/blog_providers.dart';
import '../../domain/blog_post.dart';
import '../blog_navigation.dart';
import 'blog_parts.dart';

/// "Do blog" na Início: os posts mais recentes em linha compacta e "Ver tudo"
/// para o feed. Sem post (ou carregando, ou com erro), não ocupa espaço —
/// nem o respiro da seção.
class HomeBlogSection extends ConsumerWidget {
  const HomeBlogSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final posts = ref.watch(blogHomePostsProvider).valueOrNull ?? const [];
    if (posts.isEmpty) return const SizedBox.shrink();
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.sectionGap,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CompeteHubSectionHeader(
            title: 'Do blog',
            actionLabel: 'VER TUDO',
            onActionTap: () => openBlogFeed(context),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              borderRadius: const BorderRadius.all(Radius.circular(22)),
            ),
            child: Column(
              children: [
                for (var i = 0; i < posts.length; i++)
                  _CompactRow(
                    post: posts[i],
                    divider: i > 0,
                    onTap: () => openBlogPost(context, posts[i].id),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CompactRow extends StatelessWidget {
  const _CompactRow({
    required this.post,
    required this.divider,
    required this.onTap,
  });

  final BlogPost post;
  final bool divider;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: divider
            ? Border(
                top: BorderSide(
                  color: colors.onSurface.withValues(alpha: 0.06),
                ),
              )
            : null,
      ),
      child: InkWell(
        key: Key('home-blog-${post.id}'),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            children: [
              BlogCover(post: post, width: 56, height: 56, radius: 12),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    BlogCategoryLabel(post.categoryKey),
                    const SizedBox(height: 3),
                    Text(
                      post.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        height: 1.3,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${post.readMinutes} min de leitura',
                      style: AppTypography.soraRegular(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w400,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: colors.onSurface.withValues(alpha: 0.32),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
