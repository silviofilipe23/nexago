import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';

/// Tipo visual da página de feedback.
enum FeedbackKind { success, error, alert, info }

/// Ação exibida na página de feedback.
class FeedbackAction {
  const FeedbackAction({
    required this.label,
    required this.onPressed,
    this.isPrimary = true,
  });

  final String label;
  final VoidCallback onPressed;
  final bool isPrimary;
}

/// Página reutilizável de feedback (sucesso, erro, alerta, info).
class FeedbackPage extends StatelessWidget {
  const FeedbackPage({
    super.key,
    required this.kind,
    required this.title,
    this.description,
    this.eyebrow,
    this.primaryAction,
    this.secondaryAction,
    this.extraContent,
    this.icon,
    this.onClose,
    this.showCloseButton = false,
  });

  final FeedbackKind kind;
  final String title;
  final String? description;
  final String? eyebrow;
  final FeedbackAction? primaryAction;
  final FeedbackAction? secondaryAction;
  final Widget? extraContent;
  final IconData? icon;
  final VoidCallback? onClose;
  final bool showCloseButton;

  factory FeedbackPage.success({
    Key? key,
    required String title,
    String? description,
    String? eyebrow,
    FeedbackAction? primaryAction,
    FeedbackAction? secondaryAction,
    Widget? extraContent,
    IconData? icon,
    VoidCallback? onClose,
    bool showCloseButton = false,
  }) {
    return FeedbackPage(
      key: key,
      kind: FeedbackKind.success,
      title: title,
      description: description,
      eyebrow: eyebrow,
      primaryAction: primaryAction,
      secondaryAction: secondaryAction,
      extraContent: extraContent,
      icon: icon,
      onClose: onClose,
      showCloseButton: showCloseButton,
    );
  }

  factory FeedbackPage.error({
    Key? key,
    required String title,
    String? description,
    String? eyebrow,
    FeedbackAction? primaryAction,
    FeedbackAction? secondaryAction,
    Widget? extraContent,
    IconData? icon,
    VoidCallback? onClose,
    bool showCloseButton = false,
  }) {
    return FeedbackPage(
      key: key,
      kind: FeedbackKind.error,
      title: title,
      description: description,
      eyebrow: eyebrow,
      primaryAction: primaryAction,
      secondaryAction: secondaryAction,
      extraContent: extraContent,
      icon: icon ?? Icons.close_rounded,
      onClose: onClose,
      showCloseButton: showCloseButton,
    );
  }

  factory FeedbackPage.alert({
    Key? key,
    required String title,
    String? description,
    String? eyebrow,
    FeedbackAction? primaryAction,
    FeedbackAction? secondaryAction,
    Widget? extraContent,
    IconData? icon,
    VoidCallback? onClose,
    bool showCloseButton = false,
  }) {
    return FeedbackPage(
      key: key,
      kind: FeedbackKind.alert,
      title: title,
      description: description,
      eyebrow: eyebrow,
      primaryAction: primaryAction,
      secondaryAction: secondaryAction,
      extraContent: extraContent,
      icon: icon ?? Icons.warning_amber_rounded,
      onClose: onClose,
      showCloseButton: showCloseButton,
    );
  }

  factory FeedbackPage.info({
    Key? key,
    required String title,
    String? description,
    String? eyebrow,
    FeedbackAction? primaryAction,
    FeedbackAction? secondaryAction,
    Widget? extraContent,
    IconData? icon,
    VoidCallback? onClose,
    bool showCloseButton = false,
  }) {
    return FeedbackPage(
      key: key,
      kind: FeedbackKind.info,
      title: title,
      description: description,
      eyebrow: eyebrow,
      primaryAction: primaryAction,
      secondaryAction: secondaryAction,
      extraContent: extraContent,
      icon: icon ?? Icons.info_outline_rounded,
      onClose: onClose,
      showCloseButton: showCloseButton,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = _paletteFor(kind);
    final resolvedIcon = icon ?? palette.defaultIcon;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (showCloseButton)
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  onPressed: onClose ?? () => Navigator.of(context).maybePop(),
                  icon: Icon(
                    Icons.close_rounded,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _FeedbackHeroIcon(
                      icon: resolvedIcon,
                      color: palette.color,
                    ),
                    const SizedBox(height: 24),
                    if (eyebrow != null && eyebrow!.trim().isNotEmpty) ...[
                      Text(
                        eyebrow!.toUpperCase(),
                        textAlign: TextAlign.center,
                        style: AppTypography.mono(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: palette.color,
                          letterSpacing: 0.8,
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    Text(
                      title,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                        letterSpacing: -0.3,
                      ),
                    ),
                    if (description != null && description!.trim().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        description!,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w500,
                          height: 1.45,
                        ),
                      ),
                    ],
                    if (extraContent != null) ...[
                      const SizedBox(height: 24),
                      extraContent!,
                    ],
                  ],
                ),
              ),
            ),
            if (primaryAction != null || secondaryAction != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (primaryAction != null)
                      SizedBox(
                        height: 52,
                        child: FilledButton(
                          onPressed: primaryAction!.onPressed,
                          style: FilledButton.styleFrom(
                            backgroundColor: primaryAction!.isPrimary
                                ? AppColors.brand
                                : context.themeColors.surfaceRaised,
                            foregroundColor: primaryAction!.isPrimary
                                ? AppColors.black
                                : context.themeColors.onSurface,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: Text(
                            primaryAction!.label,
                            style: AppTypography.soraRegular(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    if (secondaryAction != null) ...[
                      const SizedBox(height: 10),
                      TextButton(
                        onPressed: secondaryAction!.onPressed,
                        child: Text(
                          secondaryAction!.label,
                          style: AppTypography.soraRegular(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _FeedbackPalette {
  const _FeedbackPalette({required this.color, required this.defaultIcon});

  final Color color;
  final IconData defaultIcon;
}

_FeedbackPalette _paletteFor(FeedbackKind kind) {
  return switch (kind) {
    FeedbackKind.success => const _FeedbackPalette(
      color: AppColors.win,
      defaultIcon: Icons.check_rounded,
    ),
    FeedbackKind.error => const _FeedbackPalette(
      color: AppColors.live,
      defaultIcon: Icons.close_rounded,
    ),
    FeedbackKind.alert => const _FeedbackPalette(
      color: AppColors.pending,
      defaultIcon: Icons.warning_amber_rounded,
    ),
    FeedbackKind.info => const _FeedbackPalette(
      color: AppColors.brand,
      defaultIcon: Icons.info_outline_rounded,
    ),
  };
}

class FeedbackHeroIcon extends StatelessWidget {
  const FeedbackHeroIcon({
    super.key,
    required this.kind,
    this.icon,
  });

  final FeedbackKind kind;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final palette = _paletteFor(kind);
    return _FeedbackHeroIcon(
      icon: icon ?? palette.defaultIcon,
      color: palette.color,
    );
  }
}

class _FeedbackHeroIcon extends StatelessWidget {
  const _FeedbackHeroIcon({required this.icon, required this.color});

  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 88,
            height: 88,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: 0.35),
                  blurRadius: 32,
                  spreadRadius: 4,
                ),
              ],
            ),
          ),
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            child: Icon(icon, color: AppColors.white, size: 36),
          ),
        ],
      ),
    );
  }
}
