import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class LeagueDetailTabBar extends StatelessWidget {
  const LeagueDetailTabBar({super.key, required this.controller});

  final TabController controller;

  static const tabs = [
    'Visão geral',
    'Etapas',
    'Ranking',
    'Regulamento',
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      color: context.themeColors.canvas,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: TabBar(
        controller: controller,
        isScrollable: true,
        tabAlignment: TabAlignment.start,
        dividerColor: Colors.transparent,
        indicatorSize: TabBarIndicatorSize.tab,
        labelPadding: const EdgeInsets.symmetric(horizontal: 4),
        indicator: BoxDecoration(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
        ),
        labelColor: context.themeColors.onSurface,
        unselectedLabelColor: context.themeColors.onSurfaceMuted,
        labelStyle: const TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 13,
        ),
        unselectedLabelStyle: const TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 13,
        ),
        overlayColor: WidgetStateProperty.all(Colors.transparent),
        tabs: [
          for (final tab in tabs)
            Tab(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Text(tab),
              ),
            ),
        ],
      ),
    );
  }
}

class LeagueDetailGrandFinalBanner extends StatelessWidget {
  const LeagueDetailGrandFinalBanner({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final parts = text.split(' ');
    final spotsIndex = parts.indexWhere((p) => int.tryParse(p) != null);
    final spotsWord = spotsIndex >= 0 ? parts[spotsIndex] : null;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.28)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.emoji_events_outlined,
            color: AppColors.brand,
            size: 22,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: context.themeColors.onSurface.withValues(
                        alpha: 0.9,
                      ),
                      height: 1.45,
                    ),
                children: _buildSpans(text, spotsWord),
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<TextSpan> _buildSpans(String text, String? spotsWord) {
    if (spotsWord == null) {
      return [TextSpan(text: text)];
    }
    final highlight = '$spotsWord melhores';
    final index = text.indexOf(highlight);
    if (index < 0) {
      return [TextSpan(text: text)];
    }
    return [
      TextSpan(text: text.substring(0, index)),
      TextSpan(
        text: highlight,
        style: const TextStyle(
          color: AppColors.brand,
          fontWeight: FontWeight.w800,
        ),
      ),
      TextSpan(text: text.substring(index + highlight.length)),
    ];
  }
}
