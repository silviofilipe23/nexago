import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/active_role_providers.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../auth/presentation/role_selection_page.dart';
import '../../auth/widgets/auth_form_widgets.dart';

/// Home básica do organizador de torneio (v1 — em breve).
class OrganizerHomePage extends ConsumerWidget {
  const OrganizerHomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final canSwitch = ref.watch(hasMultipleMobileRolesProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: AppBar(
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: const AuthLogo(size: 36, showTagline: false),
        centerTitle: false,
        actions: [
          if (canSwitch)
            TextButton(
              onPressed: () => navigateToRoleSelection(context, ref),
              child: Text(
                'Trocar papel',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
        ],
      ),
      body: SafeArea(
        child: FadeSlideIn(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 24),
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: context.themeColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(
                    Icons.emoji_events_outlined,
                    color: AppColors.brand,
                    size: 36,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'Organizador de torneio',
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Em breve você poderá criar ligas, gerenciar inscrições e chaves pelo app.',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 28),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: context.themeColors.surfaceCard,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: context.themeColors.onSurfaceMuted
                          .withValues(alpha: 0.15),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.info_outline_rounded,
                        color: AppColors.brand.withValues(alpha: 0.9),
                        size: 22,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Enquanto isso, use o backoffice web para gerir torneios e ligas.',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            height: 1.45,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
