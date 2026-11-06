import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_icon_square_button.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../application/blog_providers.dart';
import '../domain/blog_library.dart';
import '../domain/blog_logic.dart';
import '../domain/blog_post.dart';
import 'blog_navigation.dart';
import 'widgets/blog_parts.dart';

/// Feed do blog: chips de categoria, destaque, "Continue lendo" e a lista.
/// Busca local (título, subtítulo e tags, sem acento). Entrada pela seção
/// "Do blog" da Início e por Ajustes › Sobre.
class BlogFeedPage extends ConsumerStatefulWidget {
  const BlogFeedPage({super.key});

  @override
  ConsumerState<BlogFeedPage> createState() => _BlogFeedPageState();
}

class _BlogFeedPageState extends ConsumerState<BlogFeedPage> {
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  bool _searching = false;
  String _query = '';

  /// `null` = "Para você" (todas).
  /// Id da categoria escolhida nos chips; `null` = "Para você" (todas).
  String? _category;

  @override
  void dispose() {
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  void _toggleSearch() {
    setState(() {
      _searching = !_searching;
      if (!_searching) {
        _search.clear();
        _query = '';
      }
    });
    if (_searching) _searchFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final feed = ref.watch(blogFeedProvider);
    final library =
        ref.watch(blogLibraryProvider).valueOrNull ??
        const <String, BlogLibraryEntry>{};
    final posts = feed.valueOrNull;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        bottom: false,
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.only(
            top: AppSpacing.sm,
            bottom: MediaQuery.paddingOf(context).bottom + 40,
          ),
          children: [
            _Header(searching: _searching, onSearch: _toggleSearch),
            if (_searching) ...[
              const SizedBox(height: 4),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screenH,
                ),
                child: _SearchField(
                  controller: _search,
                  focusNode: _searchFocus,
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
            ],
            if (posts == null && feed.hasError)
              BlogMessage(
                icon: Icons.cloud_off_rounded,
                text: friendlyErrorMessage(
                  feed.error!,
                  action: 'Não foi possível carregar o blog',
                  logReason: 'blog_feed',
                ),
                actionLabel: 'Tentar de novo',
                onAction: () => ref.invalidate(blogFeedProvider),
              )
            else if (posts == null)
              const _FeedSkeleton()
            else if (posts.isEmpty)
              const BlogMessage(
                icon: Icons.article_outlined,
                text: 'Ainda não tem post no blog. Volte em breve.',
              )
            else if (_searching && _query.trim().isNotEmpty)
              ..._results(searchBlogPosts(posts, _query))
            else
              ..._feed(posts, library),
          ],
        ),
      ),
    );
  }

  List<Widget> _results(List<BlogPost> results) {
    if (results.isEmpty) {
      return [
        BlogMessage(
          icon: Icons.search_off_rounded,
          text: 'Nada encontrado para “${_query.trim()}”.',
        ),
      ];
    }
    return [
      const SizedBox(height: 20),
      _SectionTitle(
        results.length == 1 ? '1 resultado' : '${results.length} resultados',
      ),
      const SizedBox(height: 12),
      _PostList(posts: results),
    ];
  }

  List<Widget> _feed(
    List<BlogPost> posts,
    Map<String, BlogLibraryEntry> library,
  ) {
    final categories = blogCategoriesWithPosts(
      posts,
      ref.watch(blogTaxonomyProvider),
    );
    final category = categories.where((c) => c.key == _category).firstOrNull;
    final visible = category == null
        ? posts
        : posts.where((p) => p.categoryKey == category.key).toList();
    final featured = blogFeaturedPost(visible);
    final rest = [
      for (final p in visible)
        if (p.id != featured?.id) p,
    ];
    final continueReading = category == null
        ? blogContinueReading(posts, library)
        : null;

    return [
      if (categories.length > 1) ...[
        const SizedBox(height: 4),
        _CategoryChips(
          categories: categories,
          selected: category,
          onSelected: (c) => setState(() => _category = c?.key),
        ),
      ],
      if (featured != null) ...[
        const SizedBox(height: 16),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          child: _FeaturedCard(
            post: featured,
            onTap: () => openBlogPost(context, featured.id),
          ),
        ),
      ],
      if (continueReading != null) ...[
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          child: _ContinueReadingCard(
            post: continueReading.post,
            progress: continueReading.entry.progress,
            onTap: () => openBlogPost(context, continueReading.post.id),
          ),
        ),
      ],
      if (rest.isNotEmpty) ...[
        const SizedBox(height: 22),
        _SectionTitle(category?.label ?? 'Para você'),
        const SizedBox(height: 12),
        _PostList(posts: rest),
      ],
    ];
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.searching, required this.onSearch});

  final bool searching;
  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        12,
      ),
      child: Row(
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
                'Blog',
                style: AppTypography.soraRegular(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  color: colors.onSurface,
                ),
              ),
            ),
          ),
          NexaIconSquareButton(
            key: const Key('blog-search-toggle'),
            icon: searching ? Icons.close_rounded : Icons.search_rounded,
            size: 42,
            tooltip: searching ? 'Fechar busca' : 'Buscar',
            onTap: onSearch,
          ),
          const SizedBox(width: 10),
          NexaIconSquareButton(
            key: const Key('blog-open-saved'),
            icon: Icons.bookmark_border_rounded,
            size: 42,
            tooltip: 'Salvos e lendo',
            onTap: () => openBlogSaved(context),
          ),
        ],
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return TextField(
      key: const Key('blog-search'),
      controller: controller,
      focusNode: focusNode,
      onChanged: onChanged,
      textInputAction: TextInputAction.search,
      style: AppTypography.soraRegular(
        fontSize: 14.5,
        fontWeight: FontWeight.w500,
        color: colors.onSurface,
      ),
      decoration: InputDecoration(
        hintText: 'Buscar no blog',
        hintStyle: AppTypography.soraRegular(
          fontSize: 14.5,
          fontWeight: FontWeight.w400,
          color: colors.onSurfaceMuted,
        ),
        prefixIcon: Icon(
          Icons.search_rounded,
          size: 20,
          color: colors.onSurfaceMuted,
        ),
        filled: true,
        fillColor: colors.surfaceRaised,
        contentPadding: const EdgeInsets.symmetric(vertical: 14),
        border: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(16)),
          borderSide: BorderSide(color: AppColors.brand.withValues(alpha: 0.5)),
        ),
      ),
    );
  }
}

class _CategoryChips extends StatelessWidget {
  const _CategoryChips({
    required this.categories,
    required this.selected,
    required this.onSelected,
  });

  final List<BlogCategory> categories;
  final BlogCategory? selected;
  final ValueChanged<BlogCategory?> onSelected;

  @override
  Widget build(BuildContext context) {
    final options = <BlogCategory?>[null, ...categories];
    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
        itemCount: options.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final c = options[i];
          return _Chip(
            key: Key('blog-chip-${c?.key ?? 'all'}'),
            label: c?.label ?? 'Para você',
            selected: c == selected,
            onTap: () => onSelected(c),
          );
        },
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? colors.onSurface : colors.surfaceRaised,
        borderRadius: AppRadii.pillAll,
        child: InkWell(
          onTap: onTap,
          borderRadius: AppRadii.pillAll,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 15),
            child: Center(
              widthFactor: 1,
              child: Text(
                label,
                style: AppTypography.soraRegular(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: selected ? colors.canvas : colors.onSurfaceMuted,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Card grande do topo: capa, selos Destaque + categoria, título e meta.
/// Fundo sempre escuro (é a capa), nos dois temas.
class _FeaturedCard extends ConsumerWidget {
  const _FeaturedCard({required this.post, required this.onTap});

  final BlogPost post;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final category = watchBlogCategory(ref, post.categoryKey);
    const radius = BorderRadius.all(Radius.circular(24));
    return Semantics(
      button: true,
      label: post.title,
      excludeSemantics: true,
      child: Material(
        color: blogCoverInk,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: Key('blog-featured-${post.id}'),
          onTap: onTap,
          child: SizedBox(
            height: 230,
            child: Stack(
              fit: StackFit.expand,
              children: [
                BlogCover(post: post, height: 230, radius: 0, watermark: false),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      // Escurece já do meio para baixo: capas com texto ou
                      // cartões desenhados brigavam com os selos e o título.
                      stops: const [0.1, 0.5, 1],
                      colors: [
                        blogCoverInk.withValues(alpha: 0),
                        blogCoverInk.withValues(alpha: 0.78),
                        blogCoverInk.withValues(alpha: 0.95),
                      ],
                    ),
                  ),
                ),
                Positioned(
                  left: 18,
                  right: 18,
                  bottom: 16,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          if (post.featured)
                            const BlogPill(
                              label: 'Destaque',
                              tone: AppColors.brand,
                              solid: true,
                            ),
                          BlogPill(
                            label: category?.label ?? 'Blog',
                            tone: blogCategoryRawTone(category),
                            backdrop: blogCoverInk,
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        post.title,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 21,
                          fontWeight: FontWeight.w800,
                          height: 1.15,
                          color: AppColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        blogReadLine(post),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w400,
                          color: AppColors.onSurface.withValues(alpha: 0.62),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ContinueReadingCard extends StatelessWidget {
  const _ContinueReadingCard({
    required this.post,
    required this.progress,
    required this.onTap,
  });

  final BlogPost post;
  final double progress;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const radius = BorderRadius.all(Radius.circular(16));
    return Material(
      color: colors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: radius,
        side: BorderSide(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: InkWell(
        key: Key('blog-continue-${post.id}'),
        onTap: onTap,
        borderRadius: radius,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Continue lendo',
                      style: AppTypography.soraRegular(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w400,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      post.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 8),
                    BlogProgressBar(progress: progress),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Text(
                '${blogProgressPercent(progress)}%',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
    child: Semantics(
      header: true,
      child: Text(
        text,
        style: AppTypography.soraRegular(
          fontSize: 17,
          fontWeight: FontWeight.w700,
          color: context.themeColors.onSurface,
        ),
      ),
    ),
  );
}

class _PostList extends StatelessWidget {
  const _PostList({required this.posts});

  final List<BlogPost> posts;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
    child: Column(
      children: [
        for (final p in posts) ...[
          BlogPostRow(
            post: p,
            meta: blogReadLine(p, long: false),
            onTap: () => openBlogPost(context, p.id),
          ),
          if (p != posts.last) const SizedBox(height: 14),
        ],
      ],
    ),
  );
}

class _FeedSkeleton extends StatelessWidget {
  const _FeedSkeleton();

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Carregando',
    child: ExcludeSemantics(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          8,
          AppSpacing.screenH,
          0,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                NexaSkeleton(width: 92, height: 38, radius: AppRadii.pillAll),
                SizedBox(width: 8),
                NexaSkeleton(width: 84, height: 38, radius: AppRadii.pillAll),
                SizedBox(width: 8),
                NexaSkeleton(width: 70, height: 38, radius: AppRadii.pillAll),
              ],
            ),
            const SizedBox(height: 16),
            const NexaSkeleton(
              height: 230,
              radius: BorderRadius.all(Radius.circular(24)),
            ),
            const SizedBox(height: 22),
            for (var i = 0; i < 3; i++) ...[
              Row(
                children: [
                  const NexaSkeleton(
                    width: 92,
                    height: 92,
                    radius: BorderRadius.all(Radius.circular(14)),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const NexaSkeleton(width: 70, height: 10),
                        const SizedBox(height: 8),
                        FractionallySizedBox(
                          widthFactor: i.isEven ? 0.9 : 0.75,
                          child: const NexaSkeleton(height: 13),
                        ),
                        const SizedBox(height: 8),
                        const NexaSkeleton(width: 90, height: 10),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
            ],
          ],
        ),
      ),
    ),
  );
}
