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
