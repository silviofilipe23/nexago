import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_discover_models.dart';

class AthleteDiscoverLevelChips extends StatefulWidget {
  const AthleteDiscoverLevelChips({
    super.key,
    required this.selected,
    required this.onSelected,
  });

  final AthleteDiscoverQuickLevel selected;
  final ValueChanged<AthleteDiscoverQuickLevel> onSelected;

  static const _horizontalPadding = 20.0;
  static const _shellPadding = 4.0;
  static const _segmentRadius = 18.0;
  static const _trackRadius = 24.0;
  static const _fadeWidth = 28.0;

  @override
  State<AthleteDiscoverLevelChips> createState() =>
      _AthleteDiscoverLevelChipsState();
}

class _AthleteDiscoverLevelChipsState extends State<AthleteDiscoverLevelChips> {
  final ScrollController _scrollController = ScrollController();
  final GlobalKey _rowKey = GlobalKey();
  late final List<GlobalKey> _segmentKeys = List.generate(
    AthleteDiscoverQuickLevel.values.length,
    (_) => GlobalKey(),
  );

  double _indicatorLeft = 0;
  double _indicatorWidth = 0;
  bool _indicatorReady = false;
  bool _showLeadingFade = false;
  bool _showTrailingFade = true;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_updateFadeVisibility);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _updateIndicatorPosition();
      _updateFadeVisibility();
      _scrollToSelected(animate: false);
    });
  }

  @override
  void didUpdateWidget(covariant AthleteDiscoverLevelChips oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selected != widget.selected) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _updateIndicatorPosition();
        _scrollToSelected();
      });
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  int get _selectedIndex =>
      AthleteDiscoverQuickLevel.values.indexOf(widget.selected);

  void _updateIndicatorPosition() {
    final rowBox = _rowKey.currentContext?.findRenderObject() as RenderBox?;
    final segmentBox =
        _segmentKeys[_selectedIndex].currentContext?.findRenderObject()
            as RenderBox?;
    if (rowBox == null || segmentBox == null || !segmentBox.hasSize) return;

    final rowOrigin = rowBox.localToGlobal(Offset.zero);
    final segmentOrigin = segmentBox.localToGlobal(Offset.zero);

    setState(() {
      _indicatorLeft = segmentOrigin.dx - rowOrigin.dx;
      _indicatorWidth = segmentBox.size.width;
      _indicatorReady = true;
    });
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
    final context = _segmentKeys[_selectedIndex].currentContext;
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
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AthleteDiscoverLevelChips._horizontalPadding,
      ),
      child: ClipRRect(
        borderRadius:
            BorderRadius.circular(AthleteDiscoverLevelChips._trackRadius),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: AppColors.black,
            borderRadius:
                BorderRadius.circular(AthleteDiscoverLevelChips._trackRadius),
          ),
          child: Padding(
            padding: const EdgeInsets.all(
              AthleteDiscoverLevelChips._shellPadding,
            ),
            child: Stack(
              children: [
                SingleChildScrollView(
                  controller: _scrollController,
                  scrollDirection: Axis.horizontal,
                  physics: const BouncingScrollPhysics(
                    parent: AlwaysScrollableScrollPhysics(),
                  ),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      AnimatedPositioned(
                        duration: const Duration(milliseconds: 220),
                        curve: Curves.easeOutCubic,
                        left: _indicatorLeft,
                        top: 0,
                        bottom: 0,
                        width: _indicatorWidth,
                        child: AnimatedOpacity(
                          duration: const Duration(milliseconds: 120),
                          opacity: _indicatorReady ? 1 : 0,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: context.themeColors.surfaceSheet,
                              borderRadius: BorderRadius.circular(
                                AthleteDiscoverLevelChips._segmentRadius,
                              ),
                            ),
                          ),
                        ),
                      ),
                      Row(
                        key: _rowKey,
                        children: [
                          for (var i = 0;
                              i < AthleteDiscoverQuickLevel.values.length;
                              i++) ...[
                            if (i > 0) const SizedBox(width: 4),
                            _LevelSegment(
                              key: _segmentKeys[i],
                              label: _labelFor(
                                AthleteDiscoverQuickLevel.values[i],
                              ),
                              selected: _selectedIndex == i,
                              onTap: () => widget.onSelected(
                                AthleteDiscoverQuickLevel.values[i],
                              ),
                            ),
                          ],
                          const SizedBox(width: 8),
                        ],
                      ),
                    ],
                  ),
                ),
                if (_showLeadingFade)
                  Positioned(
                    left: 0,
                    top: 0,
                    bottom: 0,
                    child: _ScrollEdgeFade(
                      width: AthleteDiscoverLevelChips._fadeWidth,
                      alignment: Alignment.centerLeft,
                    ),
                  ),
                if (_showTrailingFade)
                  Positioned(
                    right: 0,
                    top: 0,
                    bottom: 0,
                    child: _ScrollEdgeFade(
                      width: AthleteDiscoverLevelChips._fadeWidth,
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

  static String _labelFor(AthleteDiscoverQuickLevel level) {
    return level.label.isEmpty ? 'Todos' : level.label;
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

class _LevelSegment extends StatelessWidget {
  const _LevelSegment({
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
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(
        AthleteDiscoverLevelChips._segmentRadius,
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(
          AthleteDiscoverLevelChips._segmentRadius,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: AnimatedDefaultTextStyle(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              color: selected
                  ? context.themeColors.onSurface
                  : context.themeColors.onSurfaceMuted,
            ),
            child: Text(label),
          ),
        ),
      ),
    );
  }
}
