import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/friendly_error_message.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../application/blog_providers.dart';
import '../../domain/blog_post.dart';

/// Peças comuns do feed, da leitura, dos Salvos e da seção da Início.

/// Texto sobre o laranja cheio.
const blogOnBrand = Color(0xFF0A0A0A);

/// Fundo das capas e do card de destaque: sempre escuro, nos dois temas.
const blogCoverInk = Color(0xFF050505);

/// Cor da categoria para texto e ícone sobre as superfícies do tema. No
/// escuro é a do protótipo; no claro, o mesmo matiz escurecido (≥ 4,8:1 no
/// canvas, no card e na superfície elevada), como os tons de estado.
Color blogCategoryTone(BlogCategory? category, AppThemeColors colors) {
  if (category == null) return colors.onSurfaceMuted;
  return colors.isDark
      ? blogCategoryRawTone(category)
      : switch (category) {
          BlogCategory.torneios => AppColors.brandTextLight,
          BlogCategory.treino => AppColors.winLight,
          BlogCategory.regras => const Color(0xFF6B3FB8),
          BlogCategory.arenas => const Color(0xFF7A5A0F),
          BlogCategory.guia => const Color(0xFF2F55B8),
          BlogCategory.loja => const Color(0xFF9A3D0C),
        };
}

/// Cor crua da categoria: sobre fundo sempre escuro (capa, destaque).
Color blogCategoryRawTone(BlogCategory? category) => switch (category) {
  BlogCategory.torneios => AppColors.brand,
  BlogCategory.treino => AppColors.win,
  BlogCategory.regras => const Color(0xFFC9A7FF),
  BlogCategory.arenas => const Color(0xFFE3B85C),
  BlogCategory.guia => const Color(0xFF9AB4FF),
  BlogCategory.loja => const Color(0xFFFF8A4A),
  null => AppColors.onSurfaceMuted,
};

/// Gradiente da capa sem foto (135°), por categoria.
List<Color> _coverGradient(BlogCategory? category) {
  // O protótipo estica o gradiente além da caixa (120–140%): a ponta
  // visível é a mistura, não a cor final.
  List<Color> g(int from, int to, double reach) => [
    Color(from),
    Color.lerp(Color(from), Color(to), reach)!,
  ];
  return switch (category) {
    BlogCategory.torneios => g(0xFF2A1206, 0xFFFF6A1A, 1 / 1.4),
    BlogCategory.treino => g(0xFF0F1A14, 0xFF1F5A3C, 1 / 1.2),
    BlogCategory.regras => g(0xFF10131A, 0xFF2A3A66, 1 / 1.2),
    BlogCategory.arenas => g(0xFF1B1610, 0xFF8A6A3A, 1 / 1.2),
    BlogCategory.loja => g(0xFF1A0D05, 0xFFC4521A, 1 / 1.2),
    BlogCategory.guia || null => g(0xFF121418, 0xFF3A3F4A, 1 / 1.2),
  };
}

/// Rótulo da categoria em mono, caixa alta ("GUIA DO APP").
class BlogCategoryLabel extends StatelessWidget {
  const BlogCategoryLabel(this.category, {super.key, this.fontSize = 10});

  final BlogCategory? category;
  final double fontSize;

  @override
  Widget build(BuildContext context) => Text(
    (category?.label ?? 'Blog').toUpperCase(),
    maxLines: 1,
    overflow: TextOverflow.ellipsis,
    style: AppTypography.mono(
      fontSize: fontSize,
      fontWeight: FontWeight.w700,
      letterSpacing: fontSize * 0.14,
      color: blogCategoryTone(category, context.themeColors),
    ),
  );
}

/// Selo em pílula ("DESTAQUE", "TORNEIOS"). [tone] pinta texto e contorno;
/// [solid] enche o fundo com ele.
class BlogPill extends StatelessWidget {
  const BlogPill({
    super.key,
    required this.label,
    required this.tone,
    this.solid = false,
  });

  final String label;
  final Color tone;
  final bool solid;

  @override
  Widget build(BuildContext context) => Container(
    height: 22,
    padding: const EdgeInsets.symmetric(horizontal: 9),
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: solid ? tone : tone.withValues(alpha: 0.12),
      borderRadius: AppRadii.pillAll,
      border: Border.all(color: solid ? tone : tone.withValues(alpha: 0.35)),
    ),
    child: Text(
      label.toUpperCase(),
      maxLines: 1,
      style: AppTypography.mono(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.2,
        color: solid ? blogOnBrand : tone,
      ),
    ),
  );
}

/// Rótulo de seção em mono ("PELA METADE").
class BlogKicker extends StatelessWidget {
  const BlogKicker(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: AppTypography.mono(
      fontSize: 10.5,
      fontWeight: FontWeight.w500,
      letterSpacing: 1.7,
      color: context.themeColors.onSurfaceMuted,
    ),
  );
}

/// Barra fina de progresso (4 px, laranja).
class BlogProgressBar extends StatelessWidget {
  const BlogProgressBar({super.key, required this.progress, this.height = 4});

  final double progress;
  final double height;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(height),
    child: SizedBox(
      height: height,
      child: LinearProgressIndicator(
        value: progress.clamp(0.0, 1.0),
        backgroundColor: context.themeColors.surfaceSheet,
        color: AppColors.brand,
        minHeight: height,
      ),
    ),
  );
}

/// Capa do post: a foto, ou (sem foto e enquanto carrega) o gradiente da
/// categoria com listras, os círculos e o nome da categoria em marca-d'água.
class BlogCover extends StatelessWidget {
  const BlogCover({
    super.key,
    required this.post,
    required this.height,
    this.width = double.infinity,
    this.radius = 14,
    this.watermark = true,
  });

  final BlogPost post;
  final double height;
  final double width;
  final double radius;

  /// Nome da categoria no canto (miniaturas).
  final bool watermark;

  @override
  Widget build(BuildContext context) {
    final placeholder = _CoverPlaceholder(
      category: post.category,
      watermark: watermark,
    );
    final url = post.coverUrl;
    return ExcludeSemantics(
      child: SizedBox(
        width: width,
        height: height,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(radius),
          child: url == null
              ? placeholder
              : CachedNetworkImage(
                  imageUrl: url,
                  fit: BoxFit.cover,
                  placeholder: (_, _) => placeholder,
                  errorWidget: (_, _, _) => placeholder,
                ),
        ),
      ),
    );
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder({required this.category, required this.watermark});

  final BlogCategory? category;
  final bool watermark;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final w = box.maxWidth.isFinite ? box.maxWidth : 92.0;
      final h = box.maxHeight.isFinite ? box.maxHeight : 92.0;
      final ring = w > 200 ? 6.0 : 2.0;
      return DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: _coverGradient(category),
          ),
        ),
        child: Stack(
          clipBehavior: Clip.hardEdge,
          children: [
            const Positioned.fill(
              child: CustomPaint(painter: _CoverStripesPainter()),
            ),
            Positioned(
              right: -0.1 * w,
              top: -0.3 * h,
              width: 0.7 * w,
              height: 1.4 * h,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: AppRadii.pillAll,
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.10),
                    width: ring,
                  ),
                ),
              ),
            ),
            Positioned(
              right: 0.08 * w,
              bottom: -0.4 * h,
              width: 0.46 * w,
              height: 0.9 * h,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: AppRadii.pillAll,
                  color: Colors.white.withValues(alpha: 0.05),
                ),
              ),
            ),
            if (watermark)
              Positioned(
                left: 0.08 * w,
                right: 0.04 * w,
                bottom: 0.10 * h,
                child: Text(
                  switch (category) {
                    BlogCategory.guia => 'GUIA',
                    null => 'BLOG',
                    final c => c.label.toUpperCase(),
                  },
                  maxLines: 1,
                  overflow: TextOverflow.clip,
                  style: AppTypography.soraRegular(
                    fontSize: w < 80 ? 13 : 17,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                    color: Colors.white.withValues(alpha: 0.18),
                  ),
                ),
              ),
          ],
        ),
      );
    },
  );
}

/// Listras a 135°: 10 px fraca, 10 px vazia.
class _CoverStripesPainter extends CustomPainter {
  const _CoverStripesPainter();

  static const _period = 20.0;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    final stripe = Paint()
      ..color = Colors.white.withValues(alpha: 0.03)
      ..strokeWidth = _period / 2;
    final step = _period * math.sqrt2;
    for (var x = -size.height; x < size.width + step; x += step) {
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + size.height, 0),
        stripe,
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_CoverStripesPainter oldDelegate) => false;
}

/// Marcador de salvar: vazio ou cheio (laranja). Toque alterna.
class BlogSaveButton extends ConsumerWidget {
  const BlogSaveButton({super.key, required this.postId});

  final String postId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final saved =
        ref.watch(blogLibraryProvider).valueOrNull?[postId]?.saved ?? false;
    final colors = context.themeColors;
    return IconButton(
      key: Key('blog-save-$postId'),
      tooltip: saved ? 'Tirar dos salvos' : 'Salvar',
      visualDensity: VisualDensity.compact,
      constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
      onPressed: () => toggleBlogSaved(context, ref, postId),
      icon: Icon(
        saved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
        size: 21,
        color: saved ? colors.brandText : colors.onSurfaceMuted,
      ),
    );
  }
}

/// Salva ou tira dos salvos, com o aviso curto.
Future<void> toggleBlogSaved(
  BuildContext context,
  WidgetRef ref,
  String postId,
) async {
  try {
    final saved = await ref
        .read(blogLibraryControllerProvider)
        .toggleSaved(postId);
    if (!context.mounted) return;
    showAppSnackBar(
      context,
      saved ? 'Salvo para ler depois.' : 'Removido dos salvos.',
      duration: const Duration(seconds: 2),
    );
  } catch (e) {
    if (!context.mounted) return;
    showAppSnackBar(
      context,
      friendlyErrorMessage(
        e,
        action: 'Não foi possível salvar',
        logReason: 'blog_toggle_saved',
      ),
      isError: true,
    );
  }
}

/// Um post em lista: miniatura de 92, categoria, título, linha de meta e o
/// marcador de salvar.
class BlogPostRow extends StatelessWidget {
  const BlogPostRow({
    super.key,
    required this.post,
    required this.meta,
    required this.onTap,
    this.showSave = true,
  });

  final BlogPost post;

  /// "3 min · Equipe nexaGO", "2 min · salvo hoje".
  final String meta;
  final VoidCallback onTap;
  final bool showSave;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: Colors.transparent,
      borderRadius: const BorderRadius.all(Radius.circular(14)),
      child: InkWell(
        key: Key('blog-row-${post.id}'),
        onTap: onTap,
        borderRadius: const BorderRadius.all(Radius.circular(14)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BlogCover(post: post, width: 92, height: 92),
            const SizedBox(width: 14),
            Expanded(
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 92),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    BlogCategoryLabel(post.category),
                    const SizedBox(height: 5),
                    Text(
                      post.title,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        height: 1.3,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w400,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (showSave) BlogSaveButton(postId: post.id),
          ],
        ),
      ),
    );
  }
}

/// Mensagem centrada (vazio, erro, indisponível) com ação opcional.
class BlogMessage extends StatelessWidget {
  const BlogMessage({
    super.key,
    required this.icon,
    required this.text,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String text;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 12),
      child: Column(
        children: [
          Icon(icon, size: 32, color: colors.onSurfaceMuted),
          const SizedBox(height: 12),
          Text(
            text,
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              height: 1.45,
              color: colors.onSurfaceMuted,
            ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 12),
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(foregroundColor: colors.brandText),
              child: Text(
                actionLabel!,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: colors.brandText,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
