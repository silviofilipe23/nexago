import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';

class BookingPixAppBar extends StatelessWidget implements PreferredSizeWidget {
  const BookingPixAppBar({
    super.key,
    required this.onBack,
    this.title = 'Pagamento via PIX',
  });

  final VoidCallback onBack;

  /// Título da barra (default: 'Pagamento via PIX').
  final String title;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return NexaAppBar(
      backgroundColor: context.themeColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: onBack,
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.arrow_back_ios_new_rounded,
                  size: 18,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        title,
        style: theme.textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w800,
          color: context.themeColors.onSurface,
        ),
      ),
    );
  }
}
