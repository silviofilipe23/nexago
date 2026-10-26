import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/home_banner.dart';
import '../home_banner_navigation.dart';
import 'home_news_carousel.dart';

/// Banner compacto: uma linha, uma novidade — para quando a Home já está
/// cheia. A linha inteira abre o destino; o X dispensa.
class HomeNewsCompact extends StatefulWidget {
  const HomeNewsCompact({
    super.key,
    required this.banner,
    required this.onOpen,
    required this.onDismiss,
    required this.onSeen,
  });

  final HomeBanner banner;
  final ValueChanged<HomeBanner> onOpen;
  final ValueChanged<HomeBanner> onDismiss;
  final ValueChanged<HomeBanner> onSeen;

  @override
  State<HomeNewsCompact> createState() => _HomeNewsCompactState();
}

class _HomeNewsCompactState extends State<HomeNewsCompact> {
  @override
  void initState() {
    super.initState();
    _markSeen();
  }

  @override
  void didUpdateWidget(HomeNewsCompact oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.banner.id != widget.banner.id) _markSeen();
  }

  void _markSeen() {
    final banner = widget.banner;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onSeen(banner);
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final banner = widget.banner;
    return Semantics(
      container: true,
      label: 'Novidade no app',
      child: Material(
        color: colors.surfaceRaised,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(22)),
          side: BorderSide(color: AppColors.brand.withValues(alpha: 0.22)),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: Key('home-news-compact-${banner.id}'),
          onTap: () => widget.onOpen(banner),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: const BoxDecoration(
                    color: AppColors.brand,
                    borderRadius: BorderRadius.all(Radius.circular(15)),
                  ),
                  child: Icon(
                    homeBannerIcon(banner.destination),
                    size: 22,
                    color: const Color(0xFF0A0A0A),
                  ),
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: 'Novo · ',
                              style: TextStyle(color: colors.brandText),
                            ),
                            TextSpan(text: banner.title),
                          ],
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.2,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        banner.description,
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
                if (banner.dismissible) ...[
                  const SizedBox(width: 8),
                  HomeNewsDismissButton(
                    key: Key('home-news-dismiss-${banner.id}'),
                    onTap: () => widget.onDismiss(banner),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
