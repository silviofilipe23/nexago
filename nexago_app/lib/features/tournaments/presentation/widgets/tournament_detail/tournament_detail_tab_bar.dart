import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/tournament_detail_tab.dart';

class TournamentDetailTabBar extends StatefulWidget {
  const TournamentDetailTabBar({
    super.key,
    required this.selected,
    required this.onSelected,
    required this.tabs,
  });

  final TournamentDetailTab selected;
  final ValueChanged<TournamentDetailTab> onSelected;
  final List<TournamentDetailTab> tabs;

  static const _horizontalPadding = 20.0;
  static const _verticalPadding = 12.0;
  static const _shellPadding = 4.0;
  static const _segmentRadius = 18.0;
  static const _trackRadius = 24.0;
  static const _fadeWidth = 28.0;

  @override
  State<TournamentDetailTabBar> createState() => _TournamentDetailTabBarState();
}

class _TournamentDetailTabBarState extends State<TournamentDetailTabBar> {
  final ScrollController _scrollController = ScrollController();
  final Map<TournamentDetailTab, GlobalKey> _tabKeys = {};

  bool _showLeadingFade = false;
  bool _showTrailingFade = true;

  @override
  void initState() {
    super.initState();
    _syncTabKeys();
    _scrollController.addListener(_updateFadeVisibility);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _updateFadeVisibility();
      _scrollToSelected(animate: false);
    });
  }

  @override
  void didUpdateWidget(covariant TournamentDetailTabBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tabs != widget.tabs) {
      _syncTabKeys();
    }
    if (oldWidget.selected != widget.selected) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToSelected();
      });
    }
  }

  void _syncTabKeys() {
    for (final tab in widget.tabs) {
      _tabKeys.putIfAbsent(tab, GlobalKey.new);
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _updateFadeVisibility() {
    if (!_scrollController.hasClients) return;
    final offset = _scrollController.offset;
    final max = _scrollController.position.maxScrollExtent;
    final showLeading = offset > 4;
    final showTrailing = max > 4 && offset < max - 4;
    if (showLeading != _showLeadingFade || showTrailing != _showTrailingFade) {
      setState(() {
        _showLeadingFade = showLeading;
        _showTrailingFade = showTrailing;
      });
    }
  }

  void _scrollToSelected({bool animate = true}) {
    final context = _tabKeys[widget.selected]?.currentContext;
    if (context == null) return;
    Scrollable.ensureVisible(
      context,
      duration: animate ? const Duration(milliseconds: 220) : Duration.zero,
      curve: Curves.easeOutCubic,
      alignment: 0.35,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.canvas,
      padding: const EdgeInsets.fromLTRB(
        TournamentDetailTabBar._horizontalPadding,
        TournamentDetailTabBar._verticalPadding,
        TournamentDetailTabBar._horizontalPadding,
        TournamentDetailTabBar._verticalPadding,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(TournamentDetailTabBar._trackRadius),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: AppColors.black,
            borderRadius:
                BorderRadius.circular(TournamentDetailTabBar._trackRadius),
          ),
          child: Padding(
            padding: const EdgeInsets.all(TournamentDetailTabBar._shellPadding),
            child: Stack(
              children: [
                SingleChildScrollView(
                  controller: _scrollController,
                  scrollDirection: Axis.horizontal,
                  physics: const BouncingScrollPhysics(
                    parent: AlwaysScrollableScrollPhysics(),
                  ),
                  child: Row(
                    children: [
                      for (final tab in widget.tabs) ...[
                        if (tab != widget.tabs.first)
                          const SizedBox(width: 4),
                        _TabSegment(
                          key: _tabKeys[tab],
                          label: tab.label,
                          selected: widget.selected == tab,
                          onTap: () => widget.onSelected(tab),
                        ),
                      ],
                      const SizedBox(width: 8),
                    ],
                  ),
                ),
                if (_showLeadingFade)
                  Positioned(
                    left: 0,
                    top: 0,
                    bottom: 0,
                    child: _ScrollEdgeFade(
                      width: TournamentDetailTabBar._fadeWidth,
                      alignment: Alignment.centerLeft,
                    ),
                  ),
                if (_showTrailingFade)
                  Positioned(
                    right: 0,
                    top: 0,
                    bottom: 0,
                    child: _ScrollEdgeFade(
                      width: TournamentDetailTabBar._fadeWidth,
                      alignment: Alignment.centerRight,
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

class _ScrollEdgeFade extends StatelessWidget {
  const _ScrollEdgeFade({
    required this.width,
    required this.alignment,
  });

  final double width;
  final Alignment alignment;

  @override
  Widget build(BuildContext context) {
    final begin = alignment == Alignment.centerLeft
        ? Alignment.centerLeft
        : Alignment.centerRight;
    final end = alignment == Alignment.centerLeft
        ? Alignment.centerRight
        : Alignment.centerLeft;

    return IgnorePointer(
      child: Container(
        width: width,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: begin,
            end: end,
            colors: [
              AppColors.black,
              AppColors.black.withValues(alpha: 0),
            ],
          ),
        ),
      ),
    );
  }
}

class _TabSegment extends StatelessWidget {
  const _TabSegment({
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
    return Material(
      color: selected ? AppColors.surfaceSheet : Colors.transparent,
      borderRadius: BorderRadius.circular(
        TournamentDetailTabBar._segmentRadius,
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(
          TournamentDetailTabBar._segmentRadius,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              color: selected ? AppColors.onSurface : AppColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}

class TournamentDetailTabBarHeader extends SliverPersistentHeaderDelegate {
  TournamentDetailTabBarHeader({
    required this.selected,
    required this.onSelected,
    required this.tabs,
  });

  final TournamentDetailTab selected;
  final ValueChanged<TournamentDetailTab> onSelected;
  final List<TournamentDetailTab> tabs;

  static const _extent = 72.0;

  @override
  double get minExtent => _extent;

  @override
  double get maxExtent => _extent;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return TournamentDetailTabBar(
      selected: selected,
      onSelected: onSelected,
      tabs: tabs,
    );
  }

  @override
  bool shouldRebuild(covariant TournamentDetailTabBarHeader oldDelegate) {
    return oldDelegate.selected != selected ||
        oldDelegate.tabs != tabs;
  }
}
