import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';

class BookingDetailsAppBar extends StatelessWidget
    implements PreferredSizeWidget {
  const BookingDetailsAppBar({
    super.key,
    required this.onShare,
    required this.onCancel,
    this.showCancel = true,
  });

  final VoidCallback onShare;
  final VoidCallback onCancel;
  final bool showCancel;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return NexaAppBar(
      backgroundColor: context.themeColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      leading: Padding(
        padding: const EdgeInsets.only(left: 8),
        child: _IconSquareButton(
          icon: Icons.arrow_back_ios_new_rounded,
          onTap: () => Navigator.of(context).maybePop(),
        ),
      ),
      title: Text(
        'Detalhes da reserva',
        style: theme.textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w800,
          color: context.themeColors.onSurface,
        ),
      ),
      actions: [
        // PopupMenuButton<String>(
        //   icon: Icon(
        //     Icons.more_horiz_rounded,
        //     color: context.themeColors.onSurfaceMuted,
        //   ),
        //   color: context.themeColors.surfaceSheet,
        //   onSelected: (value) {
        //     switch (value) {
        //       case 'share':
        //         onShare();
        //       case 'cancel':
        //         if (showCancel) onCancel();
        //     }
        //   },
        //   itemBuilder: (context) => [
        //     const PopupMenuItem(
        //       value: 'share',
        //       child: Text('Compartilhar reserva'),
        //     ),
        //     if (showCancel)
        //       const PopupMenuItem(
        //         value: 'cancel',
        //         child: Text('Cancelar reserva'),
        //       ),
        //   ],
        // ),
        // const SizedBox(width: 4),
      ],
    );
  }
}

class _IconSquareButton extends StatelessWidget {
  const _IconSquareButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: context.themeColors.surfaceRaised),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 18, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}
