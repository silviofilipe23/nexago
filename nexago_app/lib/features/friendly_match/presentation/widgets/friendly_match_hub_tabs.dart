import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';

enum FriendlyMatchHubTab { received, sent, games, history }

class FriendlyMatchHubTabs extends StatelessWidget {
  const FriendlyMatchHubTabs({
    super.key,
    required this.controller,
    required this.selected,
    required this.receivedCount,
    required this.sentCount,
    required this.gamesCount,
    required this.onSelected,
  });

  final TabController controller;
  final FriendlyMatchHubTab selected;
  final int receivedCount;
  final int sentCount;
  final int gamesCount;
  final ValueChanged<FriendlyMatchHubTab> onSelected;

  static const _tabs = <(FriendlyMatchHubTab, IconData, String)>[
    (FriendlyMatchHubTab.received, Icons.inbox_rounded, 'Recebidos'),
    (FriendlyMatchHubTab.sent, Icons.send_rounded, 'Enviados'),
    (FriendlyMatchHubTab.games, Icons.event_rounded, 'Jogos'),
    (FriendlyMatchHubTab.history, Icons.history_rounded, 'Histórico'),
  ];

  int? _badgeFor(FriendlyMatchHubTab tab) => switch (tab) {
        FriendlyMatchHubTab.received =>
          receivedCount > 0 ? receivedCount : null,
        FriendlyMatchHubTab.sent => sentCount > 0 ? sentCount : null,
        FriendlyMatchHubTab.games => gamesCount > 0 ? gamesCount : null,
        FriendlyMatchHubTab.history => null,
      };

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
      child: Row(
        children: [
          for (final (tab, icon, label) in _tabs) ...[
            Expanded(
              child: _HubTabItem(
                icon: icon,
                label: label,
                selected: selected == tab,
                badgeCount: _badgeFor(tab),
                onTap: () {
                  onSelected(tab);
                  controller.animateTo(tab.index);
                },
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HubTabItem extends StatefulWidget {
  const _HubTabItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.badgeCount,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final int? badgeCount;
  final VoidCallback onTap;

  @override
  State<_HubTabItem> createState() => _HubTabItemState();
}

class _HubTabItemState extends State<_HubTabItem> {
  var _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final labelColor = widget.selected
        ? context.themeColors.onSurface
        : context.themeColors.onSurfaceMuted;

    return GestureDetector(
      onTapDown: (_) => _setPressed(true),
      onTapUp: (_) => _setPressed(false),
      onTapCancel: () => _setPressed(false),
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedScale(
        scale: _pressed ? 0.94 : 1,
        duration: const Duration(milliseconds: 150),
        curve: Curves.easeOutCubic,
        alignment: Alignment.topCenter,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: context.themeColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: widget.selected
                            ? AppColors.brand
                            : context.themeColors.outline.withValues(alpha: 0.2),
                        width: widget.selected ? 1.5 : 1,
                      ),
                    ),
                    child: Icon(
                      widget.icon,
                      size: 22,
                      color: widget.selected
                          ? AppColors.brand
                          : context.themeColors.onSurfaceMuted,
                    ),
                  ),
                  if (widget.badgeCount != null)
                    Positioned(
                      right: -4,
                      top: -4,
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 18),
                        height: 18,
                        padding: const EdgeInsets.symmetric(horizontal: 5),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.brand,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: context.themeColors.canvas,
                            width: 1.5,
                          ),
                        ),
                        child: Text(
                          '${widget.badgeCount}',
                          style: AppTypography.mono(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: AppColors.black,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                widget.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: labelColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
