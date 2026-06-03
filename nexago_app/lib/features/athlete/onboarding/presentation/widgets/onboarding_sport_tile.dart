import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/athlete_onboarding_options.dart';

class OnboardingSportTile extends StatefulWidget {
  const OnboardingSportTile({
    super.key,
    required this.option,
    required this.selected,
    required this.onTap,
    this.multiSelect = false,
  });

  final OnboardingSportOption option;
  final bool selected;
  final VoidCallback onTap;
  final bool multiSelect;

  @override
  State<OnboardingSportTile> createState() => _OnboardingSportTileState();
}

class _OnboardingSportTileState extends State<OnboardingSportTile> {
  static const _selectionDuration = Duration(milliseconds: 220);
  static const _pressDuration = Duration(milliseconds: 90);

  bool _pressed = false;

  double get _scale {
    if (_pressed) return 0.94;
    if (widget.selected) return 1.03;
    return 1;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final opacity = widget.option.dimmed ? 0.55 : 1.0;
    final unselectedBorder =
        context.themeColors.onSurfaceMuted.withValues(alpha: 0.2);

    return Opacity(
      opacity: opacity,
      child: AnimatedScale(
        scale: _scale,
        duration: _pressed ? _pressDuration : _selectionDuration,
        curve: _pressed ? Curves.easeIn : Curves.easeOutBack,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: widget.onTap,
            onHighlightChanged: (pressed) {
              if (mounted) setState(() => _pressed = pressed);
            },
            borderRadius: BorderRadius.circular(14),
            child: AnimatedContainer(
              duration: _selectionDuration,
              curve: Curves.easeOutCubic,
              decoration: BoxDecoration(
                color: context.themeColors.surfaceRaised.withValues(
                  alpha: widget.selected ? 0.95 : 0.85,
                ),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: Color.lerp(
                        unselectedBorder,
                        AppColors.brand,
                        widget.selected ? 1 : 0,
                      ) ??
                      unselectedBorder,
                  width: widget.selected ? 1.5 : 1,
                ),
                boxShadow: widget.selected
                    ? [
                        BoxShadow(
                          color: AppColors.brand.withValues(alpha: 0.22),
                          blurRadius: 14,
                          offset: const Offset(0, 4),
                        ),
                      ]
                    : null,
              ),
              child: Stack(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 10,
                    ),
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SizedBox(
                            height: 32,
                            child: Center(
                              child: AnimatedScale(
                                scale: widget.selected ? 1.1 : 1,
                                duration: _selectionDuration,
                                curve: Curves.easeOutBack,
                                child: Icon(
                                  widget.option.icon,
                                  size: 26,
                                  color: widget.selected
                                      ? AppColors.brand
                                      : context.themeColors.onSurface,
                                ),
                              ),
                            ),
                          ),
                          SizedBox(height: 5),
                          AnimatedDefaultTextStyle(
                            duration: _selectionDuration,
                            curve: Curves.easeOut,
                            style:
                                theme.textTheme.labelSmall?.copyWith(
                                      color: widget.selected
                                          ? AppColors.brand
                                          : context.themeColors.onSurface,
                                      fontWeight: FontWeight.w700,
                                      height: 1.15,
                                    ) ??
                                    TextStyle(),
                            child: Text(
                              widget.option.label,
                              textAlign: TextAlign.center,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (widget.multiSelect)
                    Positioned(
                      top: 6,
                      right: 6,
                      child: AnimatedScale(
                        scale: widget.selected ? 1 : 0,
                        duration: _selectionDuration,
                        curve: Curves.easeOutBack,
                        child: AnimatedOpacity(
                          opacity: widget.selected ? 1 : 0,
                          duration: const Duration(milliseconds: 160),
                          child: Container(
                            width: 20,
                            height: 20,
                            decoration: BoxDecoration(
                              color: AppColors.brand,
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              Icons.check_rounded,
                              size: 14,
                              color: AppColors.black,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
