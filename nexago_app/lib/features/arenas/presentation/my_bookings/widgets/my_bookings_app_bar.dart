import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../arena_booking_navigation.dart';

class MyBookingsAppBar extends StatelessWidget implements PreferredSizeWidget {
  const MyBookingsAppBar({
    super.key,
    required this.onBack,
    this.showReserveAction = true,
  });

  final VoidCallback onBack;
  final bool showReserveAction;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppBar(
      backgroundColor: AppColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: AppColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: onBack,
              borderRadius: BorderRadius.circular(12),
              child: const SizedBox(
                width: 40,
                height: 40,
                child: Icon(Icons.chevron_left_rounded, color: AppColors.onSurface),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        'Minhas reservas',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: AppColors.onSurface,
          letterSpacing: -0.3,
        ),
      ),
      actions: [
        if (showReserveAction)
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Material(
                color: AppColors.brand,
                shape: const CircleBorder(),
                child: InkWell(
                  onTap: () => openDiscoverReservarTab(context),
                  customBorder: const CircleBorder(),
                  child: const SizedBox(
                    width: 36,
                    height: 36,
                    child: Icon(
                      Icons.add_rounded,
                      color: AppColors.black,
                      size: 22,
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
