import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class AgendaHeader extends StatelessWidget {
  const AgendaHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.monthModeActive,
    required this.unreadNotificationCount,
    required this.searchVisible,
    required this.onSearchTap,
    required this.onCalendarTap,
    required this.onNotificationsTap,
  });

  final String eyebrow;
  final String title;
  final bool monthModeActive;
  final int unreadNotificationCount;
  final bool searchVisible;
  final VoidCallback onSearchTap;
  final VoidCallback onCalendarTap;
  final VoidCallback onNotificationsTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 12, 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  eyebrow,
                  style: AppTypography.mono(
                    fontSize: 11,
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0.3,
                  ),
                ),
                Text(
                  title,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: context.themeColors.onSurface,
                    letterSpacing: -0.4,
                  ),
                ),
              ],
            ),
          ),
          // SizedBox(width: 4),
          // _HeaderIconButton(
          //   icon: Icons.search_rounded,
          //   tooltip: searchVisible ? 'Fechar busca' : 'Buscar na agenda',
          //   active: searchVisible,
          //   onTap: onSearchTap,
          // ),
          SizedBox(width: 4),
          _HeaderIconButton(
            icon: Icons.calendar_month_rounded,
            tooltip: monthModeActive ? 'Visão do dia' : 'Visão do mês',
            active: monthModeActive,
            onTap: onCalendarTap,
          ),
          SizedBox(width: 4),
          Stack(
            clipBehavior: Clip.none,
            children: [
              _HeaderIconButton(
                icon: Icons.notifications_outlined,
                tooltip: 'Notificações',
                onTap: onNotificationsTap,
              ),
              if (unreadNotificationCount > 0)
                Positioned(
                  right: 6,
                  top: 6,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: AppColors.live,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: context.themeColors.canvas,
                        width: 1.5,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class AgendaSearchField extends StatelessWidget {
  const AgendaSearchField({
    super.key,
    required this.controller,
    required this.onChanged,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        decoration: InputDecoration(
          hintText: 'Buscar na agenda…',
          prefixIcon: const Icon(Icons.search_rounded, size: 20),
          filled: true,
          fillColor: context.themeColors.surfaceCard,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: context.themeColors.surfaceRaised),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: context.themeColors.surfaceRaised),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.brand, width: 1.5),
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 12,
          ),
        ),
        style: theme.textTheme.bodyMedium,
      ),
    );
  }
}

class _HeaderIconButton extends StatelessWidget {
  const _HeaderIconButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.active = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onTap,
      style: IconButton.styleFrom(
        foregroundColor: active
            ? AppColors.brand
            : context.themeColors.onSurfaceMuted,
        side: active
            ? const BorderSide(color: AppColors.brand, width: 1.5)
            : BorderSide(color: context.themeColors.surfaceRaised),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      icon: Icon(icon, size: 22),
    );
  }
}
