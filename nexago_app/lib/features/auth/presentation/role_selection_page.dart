import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/auth/active_role_providers.dart';
import '../../../../core/auth/app_mobile_role.dart';
import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/fade_slide_in.dart';
import '../domain/role_selection_providers.dart';
import '../widgets/auth_form_widgets.dart';
import 'widgets/role_selection/role_selection_card.dart';

/// Tela de seleção de papel após login (multi-role).
class RoleSelectionPage extends ConsumerStatefulWidget {
  const RoleSelectionPage({super.key});

  @override
  ConsumerState<RoleSelectionPage> createState() => _RoleSelectionPageState();
}

class _RoleSelectionPageState extends ConsumerState<RoleSelectionPage> {
  AppMobileRole? _selected;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrapSelection());
  }

  void _bootstrapSelection() {
    final roles = ref.read(roleSelectionAvailableRolesProvider);
    if (roles.isEmpty) return;

    final user = ref.read(authProvider).valueOrNull;
    if (user != null) {
      final repo = ref.read(rolePreferencesRepositoryProvider);
      final saved = repo.loadRole(user.uid);
      if (saved != null && roles.contains(saved)) {
        _selected = saved;
      }
    }
    _selected ??= roles.first;
    if (mounted) setState(() {});
  }

  Future<void> _continue() async {
    final role = _selected;
    if (role == null || _submitting) return;

    HapticFeedback.mediumImpact();
    setState(() => _submitting = true);
    try {
      await ref.read(activeMobileRoleProvider.notifier).confirmRole(role: role);
      if (!mounted) return;
      context.go(role.homeRoute);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rolesAsync = ref.watch(availableMobileRolesProvider);
    final firstName = ref.watch(roleSelectionFirstNameProvider);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: Stack(
          children: [
            const AuthCanvasGlow(),
            SafeArea(
              child: rolesAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) =>
                    Center(child: Text('Erro ao carregar papéis: $e')),
                data: (roles) {
                  if (roles.isEmpty) {
                    return const Center(
                      child: Text('Nenhum papel disponível.'),
                    );
                  }
                  final selected = _selected ?? roles.first;
                  final roleCountLabel = roles.length == 1
                      ? '1 papel'
                      : '${roles.length} papéis';

                  return FadeSlideIn(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Align(
                            alignment: Alignment.centerLeft,
                            child: AuthLogo(size: 56, showTagline: true),
                          ),
                          const SizedBox(height: 28),
                          Text(
                            'BEM-VINDO DE VOLTA',
                            style: AppTypography.mono(
                              color: AppColors.brand,
                              fontWeight: FontWeight.w800,
                              fontSize: 12,
                              letterSpacing: 1.2,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Olá, $firstName.',
                            style: theme.textTheme.headlineMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: context.themeColors.onSurface,
                              letterSpacing: -0.5,
                              height: 1.15,
                            ),
                          ),
                          const SizedBox(height: 10),
                          RichText(
                            text: TextSpan(
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                                height: 1.45,
                              ),
                              children: [
                                const TextSpan(text: 'Você tem '),
                                TextSpan(
                                  text: roleCountLabel,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.brand,
                                  ),
                                ),
                                const TextSpan(
                                  text: ' no NexaGO. Como quer entrar agora?',
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),
                          ...roles.map((role) {
                            final footerAsync = ref.watch(
                              roleSelectionFooterProvider(role),
                            );
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: RoleSelectionCard(
                                role: role,
                                selected: selected == role,
                                footer: footerAsync.valueOrNull,
                                onTap: () => setState(() => _selected = role),
                              ),
                            );
                          }),
                          const SizedBox(height: 20),
                          FilledButton(
                            onPressed: _submitting ? null : _continue,
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.brand,
                              foregroundColor: AppColors.black,
                              minimumSize: const Size.fromHeight(52),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            child: _submitting
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: AppColors.black,
                                    ),
                                  )
                                : Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        'Continuar como ',
                                        style: theme.textTheme.titleSmall
                                            ?.copyWith(
                                              fontWeight: FontWeight.w700,
                                              color: AppColors.black,
                                            ),
                                      ),
                                      Text(
                                        selected.continueLabel,
                                        style: theme.textTheme.titleSmall
                                            ?.copyWith(
                                              fontWeight: FontWeight.w900,
                                              color: AppColors.black,
                                            ),
                                      ),
                                      const SizedBox(width: 6),
                                      const Icon(
                                        Icons.arrow_forward_rounded,
                                        size: 18,
                                        color: AppColors.black,
                                      ),
                                    ],
                                  ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Atalho para trocar de papel a partir das configurações.
Future<void> navigateToRoleSelection(
  BuildContext context,
  WidgetRef ref,
) async {
  await ref.read(activeMobileRoleProvider.notifier).prepareForRoleSwitch();
  if (context.mounted) {
    context.go(AppRoutes.roleSelection);
  }
}
