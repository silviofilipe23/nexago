import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../auth/widgets/auth_form_widgets.dart';

/// Layout comum do onboarding (glow, scroll, CTA fixo).
class OnboardingScaffold extends StatelessWidget {
  const OnboardingScaffold({
    super.key,
    this.topBar,
    required this.body,
    required this.primaryLabel,
    required this.onPrimary,
    this.primaryEnabled = true,
    this.primaryLoading = false,
    this.secondaryLabel,
    this.onSecondary,
  });

  final Widget? topBar;
  final Widget body;
  final String primaryLabel;
  final VoidCallback? onPrimary;
  final bool primaryEnabled;
  final bool primaryLoading;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Stack(
          children: [
            const AuthCanvasGlow(),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (topBar != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 8, 24, 0),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 420),
                        child: topBar!,
                      ),
                    ),
                  ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(24, 16, 24, 12),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 420),
                        child: body,
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          AuthContinueButton(
                            label: primaryLabel,
                            loading: primaryLoading,
                            onPressed: primaryEnabled && !primaryLoading
                                ? onPrimary
                                : null,
                          ),
                          if (secondaryLabel != null && onSecondary != null) ...[
                            SizedBox(height: 12),
                            TextButton(
                              onPressed: primaryLoading ? null : onSecondary,
                              child: Text(
                                secondaryLabel!,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleSmall
                                    ?.copyWith(
                                      color: context.themeColors.onSurfaceMuted,
                                      fontWeight: FontWeight.w600,
                                    ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
