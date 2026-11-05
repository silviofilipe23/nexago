import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/links/open_external_url.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../app_news/presentation/widgets/app_news_parts.dart';
import '../../../store/application/store_providers.dart';
import '../../../store/domain/store_rules.dart';
import '../../../store/presentation/store_copy.dart';
import '../../../tournaments/data/tournament_inscriptions_repository.dart';
import '../../../tournaments/domain/tournament_discovery_labels.dart';
import '../../../tournaments/domain/tournament_discovery_models.dart';
import '../../../tournaments/domain/tournament_discovery_providers.dart';
import '../../domain/blog_embed_logic.dart';
import '../../domain/blog_post.dart';
import 'blog_parts.dart';

/// Blocos nexaGO da leitura: Torneio e Produto lidos AO VIVO (doc sumido, não
/// público ou Loja desligada = o bloco some em silêncio) e Vídeo, que abre o
/// link fora do app (sem player embutido).

/// Card do torneio: status (com "fecham em N dias"), data, local, vagas e o
/// botão para o detalhe.
class BlogTournamentEmbedCard extends ConsumerWidget {
  const BlogTournamentEmbedCard({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tournament = ref
        .watch(tournamentDetailProvider(tournamentId))
        .valueOrNull;
    if (tournament == null || !blogTournamentVisible(tournament)) {
      return const SizedBox.shrink();
    }
    final colors = context.themeColors;
    final status = blogTournamentCardStatus(tournament, now: DateTime.now());
    final counts = ref
        .watch(tournamentCategoryEnrollmentCountsProvider(tournamentId))
        .valueOrNull;
    final spotsLeft = status.registrationOpen
        ? blogTournamentSpotsLeft(tournament, enrollmentByCategoryId: counts)
        : null;
    final tone = status.registrationOpen
        ? colors.brandText
        : colors.readableTone(tournamentStatusColor(tournament.status));
    final place = {
      tournament.location.trim(),
      tournament.city.trim(),
    }.where((s) => s.isNotEmpty).join(' · ');
    const radius = BorderRadius.all(Radius.circular(18));

    void open() => context.pushNamed(
      AppRouteNames.tournamentDetail,
      pathParameters: {'tournamentId': tournament.id},
    );

    return Container(
      key: Key('blog-tournament-$tournamentId'),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: radius,
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.4)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.08),
              border: Border(
                bottom: BorderSide(
                  color: colors.onSurface.withValues(alpha: 0.08),
                ),
              ),
            ),
            child: Row(
              children: [
                Icon(Icons.emoji_events_outlined, size: 15, color: tone),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    status.label.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.4,
                      color: tone,
                    ),
                  ),
                ),
                if (status.closesLabel != null)
                  Text(
                    status.closesLabel!,
                    style: AppTypography.soraRegular(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w400,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  tournament.name,
                  style: AppTypography.soraRegular(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 10),
                _InfoLine(
                  icon: Icons.calendar_today_outlined,
                  text: tournament.dateLabel,
                ),
                if (place.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  _InfoLine(icon: Icons.place_outlined, text: place),
                ],
                if (spotsLeft != null) ...[
                  const SizedBox(height: 6),
                  _InfoLine(
                    icon: Icons.groups_outlined,
                    text: switch (spotsLeft) {
                      0 => 'Vagas esgotadas',
                      1 => '1 vaga restante',
                      _ => '$spotsLeft vagas restantes',
                    },
                  ),
                ],
                const SizedBox(height: 12),
                AppNewsPrimaryButton(
                  key: Key('blog-tournament-open-$tournamentId'),
                  label: !status.registrationOpen
                      ? 'Ver torneio'
                      : tournament.format == TournamentFormat.dupla
                      ? 'Inscrever minha dupla'
                      : 'Fazer inscrição',
                  onTap: open,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Icon(icon, size: 15, color: colors.onSurfaceMuted),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w400,
              height: 1.35,
              color: colors.onSurfaceMuted,
            ),
          ),
        ),
      ],
    );
  }
}

/// Card do produto da Loja: foto, nome, "a partir de R$ X" e o botão para a
/// página do produto. Some sem produto (ou fora do canal do app) e com a Loja
/// desligada, como a chamada "loja".
class BlogProductEmbedCard extends ConsumerWidget {
  const BlogProductEmbedCard({super.key, required this.productId});

  final String productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(storeEnabledProvider)) return const SizedBox.shrink();
    final product = ref.watch(storeProductProvider(productId)).product;
    if (product == null) return const SizedBox.shrink();
    final colors = context.themeColors;
    final photo =
        product.coverUrl ??
        (product.photos.isEmpty ? null : product.photos.first.url);
    final price = StoreCopy.price(displayPriceCents(product));
    const radius = BorderRadius.all(Radius.circular(18));

    return Material(
      color: colors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: radius,
        side: BorderSide(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('blog-product-$productId'),
        onTap: () => context.pushNamed(
          AppRouteNames.storeProduct,
          pathParameters: {'productId': product.id},
          queryParameters: {'origem': 'blog'},
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: AppRadii.mdAll,
                child: SizedBox(
                  width: 84,
                  height: 84,
                  child: photo == null
                      ? _ProductPlaceholder(colors: colors)
                      : CachedNetworkImage(
                          imageUrl: photo,
                          fit: BoxFit.cover,
                          placeholder: (_, _) =>
                              _ProductPlaceholder(colors: colors),
                          errorWidget: (_, _, _) =>
                              _ProductPlaceholder(colors: colors),
                        ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const BlogCategoryLabel(BlogCategory.loja),
                    const SizedBox(height: 4),
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        height: 1.3,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      product.soldOut
                          ? 'Esgotado'
                          : priceVaries(product)
                          ? '${StoreCopy.fromPrefix}$price'
                          : price,
                      style: AppTypography.soraRegular(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: product.soldOut
                            ? colors.onSurfaceMuted
                            : colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text(
                          'Ver produto',
                          style: AppTypography.soraRegular(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: colors.brandText,
                          ),
                        ),
                        Icon(
                          Icons.chevron_right_rounded,
                          size: 18,
                          color: colors.brandText,
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

class _ProductPlaceholder extends StatelessWidget {
  const _ProductPlaceholder({required this.colors});

  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: colors.surfaceRaised,
    child: Icon(
      Icons.storefront_outlined,
      size: 28,
      color: colors.onSurfaceMuted,
    ),
  );
}

/// Vídeo: miniatura (YouTube) ou capa com o ícone (Instagram), o play e a
/// legenda. O toque abre o link fora do app.
class BlogVideoCard extends StatelessWidget {
  const BlogVideoCard({super.key, required this.video});

  final BlogVideo video;

  Future<void> _open(BuildContext context) async {
    final opened = await openExternalUrl(video.url);
    if (!opened && context.mounted) {
      showAppSnackBar(
        context,
        'Não foi possível abrir o vídeo.',
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final thumb = video.thumbnailUrl;
    final source = video.isInstagram ? 'Instagram' : 'YouTube';
    final placeholder = _VideoPlaceholder(instagram: video.isInstagram);
    return Semantics(
      button: true,
      label: 'Abrir vídeo no $source',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Material(
            color: blogCoverInk,
            borderRadius: AppRadii.lgAll,
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              key: Key('blog-video-${video.url.hashCode}'),
              onTap: () => _open(context),
              child: AspectRatio(
                aspectRatio: 16 / 9,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (thumb == null)
                      placeholder
                    else
                      CachedNetworkImage(
                        imageUrl: thumb,
                        fit: BoxFit.cover,
                        placeholder: (_, _) => placeholder,
                        errorWidget: (_, _, _) => placeholder,
                      ),
                    Center(
                      child: Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: blogCoverInk.withValues(alpha: 0.6),
                          border: Border.all(
                            color: AppColors.onSurface.withValues(alpha: 0.3),
                          ),
                        ),
                        child: const Icon(
                          Icons.play_arrow_rounded,
                          size: 32,
                          color: AppColors.onSurface,
                        ),
                      ),
                    ),
                    Positioned(
                      left: 12,
                      bottom: 10,
                      child: Text(
                        'ASSISTIR NO ${source.toUpperCase()}',
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.2,
                          color: AppColors.onSurface,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (video.caption.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              video.caption,
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
    );
  }
}

class _VideoPlaceholder extends StatelessWidget {
  const _VideoPlaceholder({required this.instagram});

  final bool instagram;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: instagram
            ? const [Color(0xFF2A0F2E), Color(0xFF8A2E5C)]
            : const [Color(0xFF1A1A1E), Color(0xFF3A1414)],
      ),
    ),
    child: Align(
      alignment: const Alignment(0.85, -0.75),
      child: Icon(
        instagram ? Icons.camera_alt_outlined : Icons.smart_display_outlined,
        size: 26,
        color: AppColors.onSurface.withValues(alpha: 0.5),
      ),
    ),
  );
}
