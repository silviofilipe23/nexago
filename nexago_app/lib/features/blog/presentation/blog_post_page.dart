import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/deep_link/app_domains.dart';
import '../../../core/errors/friendly_error_message.dart';
import '../../../core/observability/analytics_log.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/nexa_icon_square_button.dart';
import '../../../core/ui/nexa_share.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../app_news/presentation/widgets/app_news_parts.dart';
import '../application/blog_providers.dart';
import '../domain/blog_library.dart';
import '../domain/blog_logic.dart';
import '../domain/blog_post.dart';
import '../domain/blog_read_session.dart';
import 'blog_navigation.dart';
import 'widgets/blog_embeds.dart';
import 'widgets/blog_embeds_arena_ranking.dart';
import 'widgets/blog_notify_widgets.dart';
import 'widgets/blog_parts.dart';

/// Leitura do post: capa, autor, blocos, chamada no fim, "Ajudou" e "Leia
/// também". Grava o início da leitura ao abrir e o progresso conforme rola
/// (só aumenta; perto do fim marca como lido).
///
/// Métricas: cada abertura é uma sessão ([BlogReadSession]) que conta o tempo
/// só com a tela à vista (outra tela por cima pausa) e grava UMA vez em
/// `blogReads` — ao sair da tela ou quando o app vai para segundo plano (onde
/// o sistema pode matá-lo). Voltar do segundo plano abre sessão nova.
class BlogPostPage extends ConsumerStatefulWidget {
  const BlogPostPage({super.key, required this.postId});

  final String postId;

  @override
  ConsumerState<BlogPostPage> createState() => _BlogPostPageState();
}

class _BlogPostPageState extends ConsumerState<BlogPostPage> {
  static const _coverHeight = 300.0;

  /// Grava de novo só depois de avançar isto…
  static const _progressStep = 0.1;

  /// …e de passar este tempo desde a última gravação.
  static const _progressInterval = Duration(seconds: 3);

  final _scroll = ScrollController();
  final _bodyEndKey = GlobalKey();
  final _progress = ValueNotifier<double>(0);
  late final BlogLibraryController _library;
  late final BlogReadRecorder _reads;
  late final DateTime Function() _clock;
  late final AppLifecycleListener _lifecycle;

  /// Post desta abertura e a sessão de leitura em curso.
  BlogPost? _sessionPost;
  BlogReadSession? _session;

  /// Esta tela é a do topo (nenhuma rota por cima).
  bool _routeCurrent = true;

  bool _opened = false;
  double _maxProgress = 0;
  double _written = 0;
  DateTime? _writtenAt;
  bool _finishWritten = false;

  /// "Ajudou" otimista até o gatilho atualizar o post.
  bool? _helpfulOverride;
  int? _countAtToggle;
  int _pendingDelta = 0;

  @override
  void initState() {
    super.initState();
    _library = ref.read(blogLibraryControllerProvider);
    _reads = ref.read(blogReadRecorderProvider);
    _clock = ref.read(blogReadClockProvider);
    _lifecycle = AppLifecycleListener(
      onPause: _onAppPaused,
      onResume: _onAppResumed,
    );
    _scroll.addListener(_onScroll);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // `ModalRoute.of` avisa quando outra rota cobre (ou descobre) esta.
    _routeCurrent = ModalRoute.of(context)?.isCurrent ?? true;
    final session = _session;
    if (session == null) return;
    _routeCurrent ? session.resume() : session.pause();
  }

  void _startSession(BlogPost post) {
    final session = BlogReadSession(
      postId: post.id,
      category: post.category,
      clock: _clock,
      startProgress: _progress.value,
    );
    if (!_routeCurrent) session.pause();
    _session = session;
  }

  /// Segundo plano: o sistema pode matar o app sem `dispose`, então a sessão
  /// fecha e grava aqui.
  void _onAppPaused() {
    final session = _session;
    if (session != null) _reads.record(session);
  }

  /// De volta do segundo plano: a sessão gravada na pausa não reabre.
  void _onAppResumed() {
    final post = _sessionPost;
    if (post != null && (_session?.isClosed ?? false)) _startSession(post);
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    // Sessão já gravada na pausa não grava de novo (`close` só devolve uma vez).
    final session = _session;
    if (session != null) _reads.record(session);
    // Sai da tela: grava o que avançou desde a última vez.
    if (_opened && _maxProgress > _written + 0.005) {
      unawaited(
        _library
            .reportProgress(widget.postId, _maxProgress)
            .catchError((Object _) {}),
      );
    }
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    _progress.dispose();
    super.dispose();
  }

  void _onOpened(BlogPost post) {
    if (_opened) return;
    _opened = true;
    _sessionPost = post;
    _startSession(post);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      unawaited(_library.markOpened(post.id).catchError((Object _) {}));
      logAnalytics(
        ref,
        (a) => a.logBlogPostOpened(post.category?.key ?? 'outra'),
      );
      // Post que cabe na tela inteira já está lido.
      _onScroll();
    });
  }

  /// Progresso = quanto do corpo passou pelo pé da tela (o "Leia também" e o
  /// "Ajudou" não contam).
  void _onScroll() {
    if (!_scroll.hasClients) return;
    final position = _scroll.position;
    var target = position.maxScrollExtent;
    final box = _bodyEndKey.currentContext?.findRenderObject();
    if (box != null) {
      final viewport = RenderAbstractViewport.maybeOf(box);
      if (viewport != null) {
        final reveal = viewport.getOffsetToReveal(box, 1).offset;
        if (reveal < target) target = reveal;
      }
    }
    final value = target <= 0
        ? 1.0
        : (position.pixels / target).clamp(0.0, 1.0);
    _progress.value = value;
    _session?.reportProgress(value);
    if (value > _maxProgress) _maxProgress = value;
    _maybeWriteProgress();
  }

  void _maybeWriteProgress() {
    if (!_opened) return;
    final now = DateTime.now();
    final finishing = !_finishWritten && _maxProgress >= blogFinishedThreshold;
    final stepped =
        _maxProgress - _written >= _progressStep &&
        (_writtenAt == null ||
            now.difference(_writtenAt!) >= _progressInterval);
    if (!finishing && !stepped) return;
    _written = _maxProgress;
    _writtenAt = now;
    if (finishing) _finishWritten = true;
    unawaited(
      _library
          .reportProgress(widget.postId, _maxProgress)
          .catchError((Object _) {}),
    );
  }

  Future<void> _toggleHelpful(BlogPost post, bool current) async {
    final next = !current;
    setState(() {
      if (_countAtToggle == null || post.helpfulCount != _countAtToggle) {
        _countAtToggle = post.helpfulCount;
        _pendingDelta = 0;
      }
      _pendingDelta += next ? 1 : -1;
      _helpfulOverride = next;
    });
    try {
      await _library.setHelpful(post.id, helpful: next);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _pendingDelta -= next ? 1 : -1;
        _helpfulOverride = current;
      });
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível registrar',
          logReason: 'blog_helpful',
        ),
        isError: true,
      );
    }
  }

  void _share(BlogPost post) {
    unawaited(
      nexaShareText(
        context,
        '${post.title}\n${AppShareLinks.blogPost(post.slug)}',
        subject: post.title,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(blogPostProvider(widget.postId));
    final post = async.valueOrNull;
    if (post != null) _onOpened(post);

    final Widget body;
    if (post != null) {
      body = _content(post);
    } else if (async.hasError) {
      body = _Unavailable(
        text: friendlyErrorMessage(
          async.error!,
          action: 'Não foi possível abrir o post',
          logReason: 'blog_post',
        ),
        onRetry: () => ref.invalidate(blogPostProvider(widget.postId)),
      );
    } else if (async.isLoading) {
      body = const _PostSkeleton();
    } else {
      body = const _Unavailable(text: 'Este post não está mais disponível.');
    }

    return Scaffold(backgroundColor: colors.canvas, body: body);
  }

  Widget _content(BlogPost post) {
    final colors = context.themeColors;
    final top = MediaQuery.paddingOf(context).top;
    final saved =
        ref.watch(blogLibraryProvider).valueOrNull?[post.id]?.saved ?? false;
    final serverHelpful =
        ref.watch(blogHelpfulProvider(post.id)).valueOrNull ?? false;
    final helpful = _helpfulOverride ?? serverHelpful;
    final helpfulCount = blogOptimisticHelpfulCount(
      serverCount: post.helpfulCount,
      countAtToggle: _countAtToggle,
      pendingDelta: _pendingDelta,
    );
    final feed = ref.watch(blogFeedProvider).valueOrNull ?? const [];
    final related = blogRelatedPosts(post, feed);
    final cta = post.cta;
    final ctaAvailable =
        cta != null && ref.watch(blogCtaAvailableProvider(cta.destination.key));

    return Stack(
      children: [
        SingleChildScrollView(
          controller: _scroll,
          padding: EdgeInsets.only(
            bottom: MediaQuery.paddingOf(context).bottom + 40,
          ),
          child: Stack(
            children: [
              SizedBox(
                height: _coverHeight,
                width: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    BlogCover(
                      post: post,
                      height: _coverHeight,
                      radius: 0,
                      watermark: false,
                    ),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          stops: const [0, 0.4, 1],
                          colors: [
                            blogCoverInk.withValues(alpha: 0.2),
                            colors.canvas.withValues(alpha: 0),
                            colors.canvas,
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  _coverHeight - 40,
                  AppSpacing.screenH,
                  0,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _PostHeader(post: post),
                    for (final block in post.body) ...[
                      const SizedBox(height: 14),
                      _BlockView(block: block),
                    ],
                    SizedBox(key: _bodyEndKey, height: 1),
                    if (ctaAvailable) ...[
                      const SizedBox(height: 20),
                      AppNewsPrimaryButton(
                        key: const Key('blog-cta'),
                        label: cta.label,
                        onTap: () {
                          _session?.markCtaClicked();
                          openBlogCta(context, ref, cta);
                        },
                      ),
                    ],
                    const SizedBox(height: 20),
                    _HelpfulCard(
                      helpful: helpful,
                      count: helpfulCount,
                      onTap: () => _toggleHelpful(post, helpful),
                      category: post.category,
                    ),
                    if (related.isNotEmpty) ...[
                      const SizedBox(height: 28),
                      Semantics(
                        header: true,
                        child: Text(
                          'Leia também',
                          style: AppTypography.soraRegular(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      for (final p in related) ...[
                        const SizedBox(height: 14),
                        BlogPostRow(
                          post: p,
                          meta: blogReadLine(p, long: false),
                          onTap: () => openBlogPost(context, p.id),
                        ),
                      ],
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
        Positioned(
          top: top + 10,
          left: AppSpacing.screenH,
          right: AppSpacing.screenH,
          child: Row(
            children: [
              AppNewsGlassButton(
                icon: Icons.arrow_back_rounded,
                label: 'Voltar',
                onTap: () => context.pop(),
              ),
              const Spacer(),
              AppNewsGlassButton(
                key: const Key('blog-post-save'),
                icon: saved
                    ? Icons.bookmark_rounded
                    : Icons.bookmark_border_rounded,
                label: saved ? 'Tirar dos salvos' : 'Salvar',
                onTap: () => toggleBlogSaved(context, ref, post.id),
              ),
              if (post.slug.isNotEmpty) ...[
                const SizedBox(width: 10),
                AppNewsGlassButton(
                  key: const Key('blog-post-share'),
                  icon: Icons.ios_share_rounded,
                  label: 'Compartilhar',
                  onTap: () => _share(post),
                ),
              ],
            ],
          ),
        ),
        Positioned(
          top: top,
          left: 0,
          right: 0,
          child: ValueListenableBuilder<double>(
            valueListenable: _progress,
            builder: (context, value, _) => LinearProgressIndicator(
              value: value,
              minHeight: 3,
              backgroundColor: colors.surfaceSheet.withValues(alpha: 0.6),
              color: AppColors.brand,
            ),
          ),
        ),
      ],
    );
  }
}

class _PostHeader extends StatelessWidget {
  const _PostHeader({required this.post});

  final BlogPost post;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final date = post.publishAt;
    final detail = [
      if (post.authorRole.isNotEmpty) post.authorRole,
      if (date != null) blogShortDate(date, DateTime.now()),
    ].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            BlogPill(
              label: post.categoryLabel,
              tone: blogCategoryTone(post.category, colors),
            ),
            const SizedBox(width: 8),
            Text(
              '${post.readMinutes} min de leitura',
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w400,
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Semantics(
          header: true,
          child: Text(
            post.title,
            style: AppTypography.soraRegular(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              height: 1.15,
              letterSpacing: -0.56,
              color: colors.onSurface,
            ),
          ),
        ),
        if (post.subtitle.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            post.subtitle,
            style: AppTypography.soraRegular(
              fontSize: 15,
              fontWeight: FontWeight.w400,
              height: 1.5,
              color: colors.onSurfaceMuted,
            ),
          ),
        ],
        if (post.authorName.isNotEmpty) ...[
          const SizedBox(height: 14),
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.brand.withValues(alpha: 0.16),
                  border: Border.all(
                    color: colors.onSurface.withValues(alpha: 0.12),
                  ),
                ),
                child: Text(
                  blogAuthorInitials(post.authorName),
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.brandText,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      post.authorName,
                      style: AppTypography.soraRegular(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    if (detail.isNotEmpty)
                      Text(
                        detail,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w400,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _BlockView extends StatelessWidget {
  const _BlockView({required this.block});

  final BlogBlock block;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final bodyColor = colors.onSurface.withValues(alpha: 0.88);
    return switch (block) {
      BlogParagraph(:final text) => Text(
        text,
        style: AppTypography.soraRegular(
          fontSize: 15.5,
          fontWeight: FontWeight.w400,
          height: 1.7,
          color: bodyColor,
        ),
      ),
      BlogHeading(:final text) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Semantics(
          header: true,
          child: Text(
            text,
            style: AppTypography.soraRegular(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              height: 1.25,
              color: colors.onSurface,
            ),
          ),
        ),
      ),
      BlogList(:final items) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final item in items)
            Padding(
              padding: EdgeInsets.only(bottom: item == items.last ? 0 : 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 9, left: 4, right: 12),
                    child: Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: colors.brandText,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      item,
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w400,
                        height: 1.6,
                        color: bodyColor,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
      // Raio só à direita: o recorte faz o canto (borda de um lado só não
      // aceita borderRadius na decoração).
      BlogQuote(:final text) => ClipRRect(
        borderRadius: const BorderRadius.horizontal(right: Radius.circular(12)),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: colors.surfaceCard,
            border: const Border(
              left: BorderSide(color: AppColors.brand, width: 3),
            ),
          ),
          child: Text(
            text,
            style: AppTypography.soraRegular(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              height: 1.45,
              color: colors.onSurface,
            ),
          ),
        ),
      ),
      BlogImage(:final url, :final caption) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: AppRadii.lgAll,
            child: CachedNetworkImage(
              imageUrl: url,
              width: double.infinity,
              fit: BoxFit.cover,
              placeholder: (_, _) =>
                  const NexaSkeleton(height: 200, radius: AppRadii.lgAll),
              errorWidget: (_, _, _) => const SizedBox.shrink(),
            ),
          ),
          if (caption.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              caption,
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w400,
                height: 1.4,
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ],
      ),
      final BlogVideo video => BlogVideoCard(video: video),
      BlogTournamentEmbed(:final tournamentId) => BlogTournamentEmbedCard(
        tournamentId: tournamentId,
      ),
      BlogProductEmbed(:final productId) => BlogProductEmbedCard(
        productId: productId,
      ),
      BlogArenaEmbed(:final arenaId) => BlogArenaEmbedCard(arenaId: arenaId),
      final BlogRankingEmbed ranking => BlogRankingEmbedCard(block: ranking),
    };
  }
}

class _HelpfulCard extends StatelessWidget {
  const _HelpfulCard({
    required this.helpful,
    required this.count,
    required this.onTap,
    required this.category,
  });

  final bool helpful;
  final int count;
  final VoidCallback onTap;

  /// Categoria do post: a linha "Avisar posts de …" embaixo do botão.
  final BlogCategory? category;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const radius = BorderRadius.all(Radius.circular(12));
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: const BorderRadius.all(Radius.circular(18)),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Esse post te ajudou?',
            style: AppTypography.soraRegular(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 12),
          Semantics(
            toggled: helpful,
            child: Material(
              color: helpful
                  ? AppColors.brand.withValues(alpha: 0.10)
                  : Colors.transparent,
              shape: RoundedRectangleBorder(
                borderRadius: radius,
                side: BorderSide(
                  color: helpful
                      ? AppColors.brand
                      : colors.onSurface.withValues(alpha: 0.16),
                ),
              ),
              child: InkWell(
                key: const Key('blog-helpful'),
                onTap: onTap,
                borderRadius: radius,
                child: SizedBox(
                  height: 46,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        helpful
                            ? Icons.thumb_up_alt_rounded
                            : Icons.thumb_up_alt_outlined,
                        size: 17,
                        color: helpful
                            ? colors.brandText
                            : colors.onSurfaceMuted,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        count > 0 ? 'Ajudou · $count' : 'Ajudou',
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: helpful
                              ? colors.onSurface
                              : colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (category != null) ...[
            const SizedBox(height: 12),
            BlogNotifyCategoryRow(category: category),
          ],
        ],
      ),
    );
  }
}

class _Unavailable extends StatelessWidget {
  const _Unavailable({required this.text, this.onRetry});

  final String text;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.sm,
        AppSpacing.screenH,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          NexaIconSquareButton(
            icon: Icons.arrow_back_rounded,
            size: 42,
            tooltip: 'Voltar',
            onTap: () => context.pop(),
          ),
          const SizedBox(height: 40),
          BlogMessage(
            icon: Icons.article_outlined,
            text: text,
            actionLabel: onRetry == null ? null : 'Tentar de novo',
            onAction: onRetry,
          ),
        ],
      ),
    ),
  );
}

class _PostSkeleton extends StatelessWidget {
  const _PostSkeleton();

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Carregando',
    child: ExcludeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const NexaSkeleton(height: 300, radius: BorderRadius.zero),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              20,
              AppSpacing.screenH,
              0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const NexaSkeleton(width: 120, height: 22),
                const SizedBox(height: 16),
                const NexaSkeleton(height: 26),
                const SizedBox(height: 8),
                const FractionallySizedBox(
                  widthFactor: 0.6,
                  child: NexaSkeleton(height: 26),
                ),
                const SizedBox(height: 24),
                for (var i = 0; i < 5; i++) ...[
                  FractionallySizedBox(
                    widthFactor: i == 4 ? 0.7 : 1,
                    child: const NexaSkeleton(height: 13),
                  ),
                  const SizedBox(height: 10),
                ],
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
