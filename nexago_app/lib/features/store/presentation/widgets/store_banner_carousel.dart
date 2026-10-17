import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_models.dart';
import 'store_style.dart';

/// Carrossel de campanhas (até 3, arrastável). Com um banner só, sem
/// indicadores. O card inteiro abre a vitrine filtrada pela coleção.
class StoreBannerCarousel extends StatefulWidget {
  const StoreBannerCarousel({
    super.key,
    required this.banners,
    required this.onTap,
  });

  final List<StoreBanner> banners;
  final ValueChanged<StoreBanner> onTap;

  @override
  State<StoreBannerCarousel> createState() => _StoreBannerCarouselState();
}

class _StoreBannerCarouselState extends State<StoreBannerCarousel> {
  final PageController _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final banners = widget.banners;
    final colors = context.themeColors;
    final current = _index.clamp(0, banners.length - 1);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: StoreStyle.bannerHeight,
          child: PageView.builder(
            controller: _controller,
            itemCount: banners.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (context, i) => Padding(
              // Respiro entre páginas ao arrastar; some no repouso.
              padding: const EdgeInsets.symmetric(horizontal: 1),
              child: _BannerCard(
                banner: banners[i],
                onTap: () => widget.onTap(banners[i]),
              ),
            ),
          ),
        ),
        if (banners.length > 1) ...[
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < banners.length; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: i == current ? 18 : 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: i == current
                        ? AppColors.brand
                        : StoreStyle.tertiary(colors),
                    borderRadius: AppRadii.pillAll,
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _BannerCard extends StatelessWidget {
  const _BannerCard({required this.banner, required this.onTap});

  final StoreBanner banner;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final imageUrl = banner.imageUrl;
    const striped = StoreStripedBox(color: StoreStyle.bannerPlaceholderBase);
    return Semantics(
      button: true,
      label: banner.title,
      child: ClipRRect(
        borderRadius: AppRadii.xlAll,
        child: Material(
          color: colors.surfaceCard,
          child: InkWell(
            onTap: onTap,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (imageUrl != null)
                  CachedNetworkImage(
                    imageUrl: imageUrl,
                    fit: BoxFit.cover,
                    placeholder: (_, _) => striped,
                    errorWidget: (_, _, _) => striped,
                  )
                else
                  striped,
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      stops: const [0.2, 1],
                      colors: [
                        colors.surfaceCard.withValues(alpha: 0),
                        colors.surfaceCard.withValues(alpha: 0.96),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (banner.kicker.isNotEmpty) ...[
                        Text(
                          banner.kicker.toUpperCase(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.mono(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.6,
                            color: AppColors.brand,
                          ),
                        ),
                        const SizedBox(height: 6),
                      ],
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(
                            child: Text(
                              banner.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.soraRegular(
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.72,
                                height: 1.08,
                                color: colors.onSurface,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Container(
                            width: 46,
                            height: 46,
                            decoration: const BoxDecoration(
                              color: AppColors.brand,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.arrow_forward_rounded,
                              size: 22,
                              color: StoreStyle.onBrand,
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
      ),
    );
  }
}
