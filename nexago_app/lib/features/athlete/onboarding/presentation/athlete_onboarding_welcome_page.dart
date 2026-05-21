import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../auth/widgets/auth_form_widgets.dart';

/// Tela 00 — Boas-vindas pós-cadastro.
class AthleteOnboardingWelcomePage extends StatelessWidget {
  const AthleteOnboardingWelcomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: Stack(
          children: [
            const AuthCanvasGlow(),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 420),
                        child: Column(
                          children: [
                            SizedBox(
                              height: 140,
                              child: Stack(
                                alignment: Alignment.center,
                                children: [
                                  DecoratedBox(
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      boxShadow: [
                                        BoxShadow(
                                          color: AppColors.brand
                                              .withValues(alpha: 0.35),
                                          blurRadius: 48,
                                          spreadRadius: 8,
                                        ),
                                      ],
                                    ),
                                    child: const SizedBox(width: 1, height: 1),
                                  ),
                                  const AuthLogo(size: 112, showTagline: false),
                                ],
                              ),
                            ),
                            const SizedBox(height: 28),
                            Text(
                              'CONTA CRIADA · VAMOS LÁ',
                              textAlign: TextAlign.center,
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: AppColors.brand,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.2,
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text.rich(
                              textAlign: TextAlign.center,
                              TextSpan(
                                style: theme.textTheme.headlineMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.onSurface,
                                  letterSpacing: -0.5,
                                  height: 1.12,
                                ),
                                children: const [
                                  TextSpan(text: 'Bem-vindo ao '),
                                  TextSpan(
                                    text: 'nexaGO.',
                                    style: TextStyle(color: AppColors.brand),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              'Personalize sua experiência esportiva em menos de 1 minuto.',
                              textAlign: TextAlign.center,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: AppColors.onSurfaceMuted,
                                height: 1.45,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: AuthContinueButton(
                        label: '→  Começar',
                        onPressed: () =>
                            context.go(AppRoutes.athleteOnboardingPrimarySport),
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
