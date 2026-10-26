import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../application/home_banners_providers.dart';
import '../../domain/home_banner.dart';
import '../home_banner_navigation.dart';
import 'home_news_carousel.dart';
import 'home_news_compact.dart';

/// Bloco "Novidades no app" da Home, logo abaixo dos atalhos: o carrossel ou,
/// sem card de carrossel para o atleta, o compacto. Sem novidade, não ocupa
/// espaço — nem o respiro da seção. Quem decide o que entra é o backoffice
/// (App do atleta › Banner de novidades).
class HomeNewsSection extends ConsumerWidget {
  const HomeNewsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final slot = ref.watch(homeBannerSlotProvider);
    if (slot == null) return const SizedBox.shrink();
    final tracker = ref.watch(homeBannerTrackerProvider);

    void open(HomeBanner banner) {
      tracker.mark(banner, HomeBannerMark.clicked);
      openHomeBannerDestination(context, ref, banner);
    }

    void dismiss(HomeBanner banner) {
      tracker.mark(banner, HomeBannerMark.dismissed);
      tracker.hide(banner);
    }

    void seen(HomeBanner banner) => tracker.mark(banner, HomeBannerMark.seen);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sectionGap),
      child: slot.format == HomeBannerFormat.carousel
          ? HomeNewsCarousel(
              banners: slot.banners,
              onOpen: open,
              onDismiss: dismiss,
              onSeen: seen,
            )
          : Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenH,
              ),
              child: HomeNewsCompact(
                banner: slot.banners.first,
                onOpen: open,
                onDismiss: dismiss,
                onSeen: seen,
              ),
            ),
    );
  }
}
