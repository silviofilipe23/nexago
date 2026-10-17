import 'package:flutter/material.dart';

import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/ui/nexa_skeleton.dart';
import 'store_product_card.dart';
import 'store_style.dart';

/// Carregando: banner, chips e 8 cards no formato final.
class StoreShowcaseSkeleton extends StatelessWidget {
  const StoreShowcaseSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final extent = StoreProductCard.extent(MediaQuery.textScalerOf(context));
    return CustomScrollView(
      physics: const NeverScrollableScrollPhysics(),
      slivers: [
        const SliverPadding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            4,
            AppSpacing.screenH,
            16,
          ),
          sliver: SliverToBoxAdapter(
            child: NexaSkeleton(
              height: StoreStyle.bannerHeight,
              radius: AppRadii.xlAll,
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenH,
              ),
              children: const [
                NexaSkeleton(width: 58, height: 40, radius: AppRadii.pillAll),
                SizedBox(width: 8),
                NexaSkeleton(width: 70, height: 40, radius: AppRadii.pillAll),
                SizedBox(width: 8),
                NexaSkeleton(width: 96, height: 40, radius: AppRadii.pillAll),
                SizedBox(width: 8),
                NexaSkeleton(width: 104, height: 40, radius: AppRadii.pillAll),
              ],
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 24)),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          sliver: SliverGrid(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: StoreStyle.gridGap,
              mainAxisSpacing: 18,
              mainAxisExtent: extent,
            ),
            delegate: SliverChildBuilderDelegate(
              (_, _) => const StoreProductCardSkeleton(),
              childCount: 8,
            ),
          ),
        ),
      ],
    );
  }
}

/// Card em carregamento (também no fim da grade, enquanto há mais página).
class StoreProductCardSkeleton extends StatelessWidget {
  const StoreProductCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        NexaSkeleton(
          height: StoreStyle.photoHeight,
          radius: BorderRadius.all(Radius.circular(StoreStyle.photoRadius)),
        ),
        SizedBox(height: 12),
        NexaSkeleton(height: 12),
        SizedBox(height: 6),
        NexaSkeleton(width: 90, height: 12),
        SizedBox(height: 10),
        NexaSkeleton(width: 80, height: 16),
      ],
    );
  }
}

/// Página do produto carregando: galeria e painel no formato final.
class StoreProductSkeleton extends StatelessWidget {
  const StoreProductSkeleton({super.key, required this.galleryHeight});

  final double galleryHeight;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      physics: const NeverScrollableScrollPhysics(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          NexaSkeleton(height: galleryHeight, radius: BorderRadius.zero),
          const Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              24,
              AppSpacing.screenH,
              0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                NexaSkeleton(width: 64, height: 24, radius: AppRadii.pillAll),
                SizedBox(height: 16),
                NexaSkeleton(height: 24),
                SizedBox(height: 8),
                NexaSkeleton(width: 200, height: 24),
                SizedBox(height: 16),
                NexaSkeleton(width: 140, height: 28),
                SizedBox(height: 8),
                NexaSkeleton(width: 120, height: 14),
                SizedBox(height: 28),
                NexaSkeleton(width: 110, height: 12),
                SizedBox(height: 12),
                Row(
                  children: [
                    NexaSkeleton.circle(size: 40),
                    SizedBox(width: 12),
                    NexaSkeleton.circle(size: 40),
                    SizedBox(width: 12),
                    NexaSkeleton.circle(size: 40),
                  ],
                ),
                SizedBox(height: 24),
                NexaSkeleton(width: 80, height: 12),
                SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: NexaSkeleton(height: 50)),
                    SizedBox(width: 8),
                    Expanded(child: NexaSkeleton(height: 50)),
                    SizedBox(width: 8),
                    Expanded(child: NexaSkeleton(height: 50)),
                    SizedBox(width: 8),
                    Expanded(child: NexaSkeleton(height: 50)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
