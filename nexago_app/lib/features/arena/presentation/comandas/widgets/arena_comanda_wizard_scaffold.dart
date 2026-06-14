import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

class ArenaComandaWizardScaffold extends StatelessWidget {
  const ArenaComandaWizardScaffold({
    super.key,
    required this.stepLabel,
    required this.title,
    required this.currentStep,
    required this.body,
    required this.footer,
    this.onBack,
  });

  final String stepLabel;
  final String title;
  final int currentStep;
  final Widget body;
  final Widget footer;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 20, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Material(
                    color: context.themeColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(12),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: onBack ?? () => Navigator.of(context).maybePop(),
                      child: SizedBox(
                        width: 44,
                        height: 44,
                        child: Icon(
                          Icons.arrow_back_rounded,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          stepLabel,
                          style: AppTypography.mono(
                            color: AppColors.brand,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8,
                            fontSize: 11,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          title,
                          style: theme.textTheme.headlineMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.5,
                            color: context.themeColors.onSurface,
                            fontSize: 26,
                            height: 1.05,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
                child: body,
              ),
            ),
            footer,
          ],
        ),
      ),
    );
  }
}

class ArenaComandaWizardContinueButton extends StatelessWidget {
  const ArenaComandaWizardContinueButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.enabled = true,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool enabled;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: SizedBox(
        width: double.infinity,
        height: 52,
        child: FilledButton(
          onPressed: enabled && !loading ? onPressed : null,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: AppColors.black,
            disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.35),
            disabledForegroundColor: AppColors.black.withValues(alpha: 0.45),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          child: loading
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.black,
                  ),
                )
              : Text(
                  label,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
        ),
      ),
    );
  }
}
