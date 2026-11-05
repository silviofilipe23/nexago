import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_icon_square_button.dart';
import '../../../core/ui/nexa_segmented_control.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../application/blog_providers.dart';
import '../domain/blog_logic.dart';
import 'blog_navigation.dart';
import 'widgets/blog_notify_widgets.dart';
import 'widgets/blog_parts.dart';

enum _Tab { saved, finished }

/// Salvos e lendo: "Salvos · N" (com "Pela metade" em cima) e "Lidos".
class BlogLibraryPage extends ConsumerStatefulWidget {
  const BlogLibraryPage({super.key});

  @override
  ConsumerState<BlogLibraryPage> createState() => _BlogLibraryPageState();
}

class _BlogLibraryPageState extends ConsumerState<BlogLibraryPage> {
  _Tab _tab = _Tab.saved;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(blogLibraryViewProvider);
    final view = async.valueOrNull;
    final now = DateTime.now();

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.sm,
            AppSpacing.screenH,
            MediaQuery.paddingOf(context).bottom + 40,
          ),
          children: [
            Row(
              children: [
                NexaIconSquareButton(
                  icon: Icons.arrow_back_rounded,
                  size: 42,
                  tooltip: 'Voltar',
                  onTap: () => context.pop(),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(
                      'Salvos e lendo',
                      style: AppTypography.soraRegular(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.4,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            NexaSegmentedControl<_Tab>(
              segments: [
                NexaSegment(
                  value: _Tab.saved,
                  label: view == null || view.saved.isEmpty
                      ? 'Salvos'
                      : 'Salvos · ${view.saved.length}',
                ),
                const NexaSegment(value: _Tab.finished, label: 'Lidos'),
              ],
              selected: _tab,
              onChanged: (t) => setState(() => _tab = t),
            ),
            if (view == null && async.hasError)
              BlogMessage(
                icon: Icons.cloud_off_rounded,
                text: friendlyErrorMessage(
                  async.error!,
                  action: 'Não foi possível carregar seus salvos',
                  logReason: 'blog_library',
                ),
                actionLabel: 'Tentar de novo',
                onAction: () => ref.invalidate(blogLibraryProvider),
              )
            else if (view == null)
              const NexaListSkeleton(
                count: 4,
                avatarSize: 0,
                padding: EdgeInsets.only(top: 24),
              )
            else if (_tab == _Tab.saved)
              ..._savedTab(view, now)
            else
              ..._finishedTab(view, now),
            // Avisos por categoria: no fim, nas duas abas.
            if (view != null) ...[
              const SizedBox(height: 22),
              const BlogNotifyCard(),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _savedTab(BlogLibraryView view, DateTime now) {
    if (view.inProgress.isEmpty && view.saved.isEmpty) {
      return [
        const BlogMessage(
          icon: Icons.bookmark_border_rounded,
          text:
              'Nada salvo ainda. Toque no marcador de um post para guardar e '
              'ler depois.',
        ),
      ];
    }
    return [
      if (view.inProgress.isNotEmpty) ...[
        const SizedBox(height: 18),
        const BlogKicker('Pela metade'),
        for (final item in view.inProgress) ...[
          const SizedBox(height: 10),
          _InProgressCard(
            item: item,
            onTap: () => openBlogPost(context, item.post.id),
          ),
        ],
      ],
      if (view.saved.isNotEmpty) ...[
        const SizedBox(height: 22),
        const BlogKicker('Salvos'),
        for (final item in view.saved) ...[
          const SizedBox(height: 14),
          BlogPostRow(
            post: item.post,
            meta:
                '${item.post.readMinutes} min · '
                '${blogSavedAgo(item.entry.savedAt, now)}',
            onTap: () => openBlogPost(context, item.post.id),
          ),
        ],
      ],
    ];
  }

  List<Widget> _finishedTab(BlogLibraryView view, DateTime now) {
    if (view.finished.isEmpty) {
      return [
        const BlogMessage(
          icon: Icons.menu_book_outlined,
          text: 'Os posts que você terminar de ler aparecem aqui.',
        ),
      ];
    }
    return [
      const SizedBox(height: 8),
      for (final item in view.finished) ...[
        const SizedBox(height: 14),
        BlogPostRow(
          post: item.post,
          meta:
              '${item.post.readMinutes} min · '
              '${blogFinishedAgo(item.entry.finishedAt, now)}',
          onTap: () => openBlogPost(context, item.post.id),
        ),
      ],
    ];
  }
}

class _InProgressCard extends StatelessWidget {
  const _InProgressCard({required this.item, required this.onTap});

  final BlogLibraryItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const radius = BorderRadius.all(Radius.circular(18));
    final left = blogRemainingMinutes(
      item.post.readMinutes,
      item.entry.progress,
    );
    return Material(
      color: colors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: radius,
        side: BorderSide(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: InkWell(
        key: Key('blog-in-progress-${item.post.id}'),
        onTap: onTap,
        borderRadius: radius,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              BlogCover(post: item.post, width: 70, height: 70, radius: 12),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.post.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        height: 1.3,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: BlogProgressBar(progress: item.entry.progress),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          '$left min restantes',
                          style: AppTypography.mono(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
