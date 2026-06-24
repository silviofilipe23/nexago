import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Botões de compartilhamento para telas de publicação (torneio, liga, etapa).
class FeedbackPublishedShareRow extends StatelessWidget {
  const FeedbackPublishedShareRow({
    super.key,
    required this.onShare,
    required this.onCopyLink,
    this.onShowQr,
  });

  final VoidCallback onShare;
  final VoidCallback onCopyLink;
  final VoidCallback? onShowQr;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _ShareButton(icon: Icons.share_rounded, onTap: onShare),
        const SizedBox(width: 12),
        _ShareButton(icon: Icons.link_rounded, onTap: onCopyLink),
        if (onShowQr != null) ...[
          const SizedBox(width: 12),
          _ShareButton(icon: Icons.qr_code_2_rounded, onTap: onShowQr!),
        ],
      ],
    );
  }
}

class _ShareButton extends StatelessWidget {
  const _ShareButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 52,
          height: 52,
          child: Icon(icon, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}
