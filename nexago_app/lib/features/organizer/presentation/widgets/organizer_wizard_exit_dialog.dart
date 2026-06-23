import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

enum WizardCloseAction { keepEditing, exit, discard }

class WizardExitDialogConfig {
  const WizardExitDialogConfig({
    this.categoryHighlight = '',
    this.discardSubtitle = 'Apaga os dados preenchidos.',
  });

  /// Ex.: "3 categorias" — vazio quando ainda não há categorias.
  final String categoryHighlight;
  final String discardSubtitle;
}

Future<WizardCloseAction?> showOrganizerWizardExitDialog(
  BuildContext context, {
  WizardExitDialogConfig? config,
}) {
  return showDialog<WizardCloseAction>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.55),
    builder: (context) => _OrganizerWizardExitDialog(config: config),
  );
}

class _OrganizerWizardExitDialog extends StatelessWidget {
  const _OrganizerWizardExitDialog({this.config});

  final WizardExitDialogConfig? config;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final categoryHighlight = config?.categoryHighlight.trim() ?? '';
    final discardSubtitle =
        config?.discardSubtitle ?? 'Apaga os dados preenchidos.';
    final hasCategories = categoryHighlight.isNotEmpty;

    return Dialog(
      backgroundColor: context.themeColors.surfaceCard,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'ANTES DE SAIR',
              style: AppTypography.mono(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.1,
                fontSize: 11,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Sair do cadastro?',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 10),
            if (hasCategories)
              Text.rich(
                TextSpan(
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.45,
                    fontWeight: FontWeight.w500,
                  ),
                  children: [
                    const TextSpan(text: 'Você já criou '),
                    TextSpan(
                      text: categoryHighlight,
                      style: TextStyle(
                        color: context.themeColors.onSurface,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const TextSpan(
                      text: '. Escolha o que fazer com o cadastro.',
                    ),
                  ],
                ),
              )
            else
              Text(
                'Escolha o que fazer com o cadastro.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.45,
                  fontWeight: FontWeight.w500,
                ),
              ),
            const SizedBox(height: 24),
            DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.brand.withValues(alpha: 0.28),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: SizedBox(
                height: 52,
                child: FilledButton.icon(
                  onPressed: () =>
                      Navigator.of(context).pop(WizardCloseAction.keepEditing),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  icon: const Icon(Icons.edit_rounded, size: 18),
                  label: const Text(
                    'Continuar editando',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),
            _OuSairDivider(),
            const SizedBox(height: 16),
            _ExitOptionTile(
              icon: Icons.logout_rounded,
              title: 'Salvar e sair',
              subtitle: 'Guarda como rascunho — retoma de onde parou.',
              onTap: () => Navigator.of(context).pop(WizardCloseAction.exit),
            ),
            const SizedBox(height: 10),
            _ExitOptionTile(
              icon: Icons.delete_outline_rounded,
              title: 'Descartar e sair',
              subtitle: discardSubtitle,
              onTap: () =>
                  Navigator.of(context).pop(WizardCloseAction.discard),
              destructive: true,
            ),
          ],
        ),
      ),
    );
  }
}

class _OuSairDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final lineColor =
        context.themeColors.onSurfaceMuted.withValues(alpha: 0.2);

    return Row(
      children: [
        Expanded(child: Divider(color: lineColor, height: 1)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            'OU SAIR',
            style: AppTypography.mono(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.9,
              fontSize: 10,
            ),
          ),
        ),
        Expanded(child: Divider(color: lineColor, height: 1)),
      ],
    );
  }
}

class _ExitOptionTile extends StatelessWidget {
  const _ExitOptionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final borderColor = destructive
        ? AppColors.live.withValues(alpha: 0.35)
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.18);
    final iconBg = destructive
        ? AppColors.live.withValues(alpha: 0.12)
        : context.themeColors.surfaceRaised;
    final iconColor = destructive ? AppColors.live : context.themeColors.onSurface;
    final titleColor =
        destructive ? AppColors.live : context.themeColors.onSurface;
    final subtitleColor = destructive
        ? AppColors.live.withValues(alpha: 0.75)
        : context.themeColors.onSurfaceMuted;
    final chevronColor = destructive
        ? AppColors.live.withValues(alpha: 0.7)
        : context.themeColors.onSurfaceMuted;

    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: borderColor),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 20, color: iconColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: titleColor,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: subtitleColor,
                        height: 1.35,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: chevronColor, size: 22),
            ],
          ),
        ),
      ),
    );
  }
}
