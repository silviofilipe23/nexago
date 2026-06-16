import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/athlete_active_sessions_providers.dart';

class AthleteActiveSessionsPage extends ConsumerWidget {
  const AthleteActiveSessionsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final sessionsAsync = ref.watch(athleteActiveSessionsProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: Icon(Icons.chevron_left_rounded),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go(AppRoutes.athletePrivacySecurity);
            }
          },
        ),
        title: Text(
          'Sessões ativas',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
      ),
      body: sessionsAsync.when(
        loading: () => Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Erro ao carregar dispositivos.\n$e',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
        data: (state) {
          if (state.tokens.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Nenhum dispositivo com notificações push registrado.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            itemCount: state.tokens.length,
            separatorBuilder: (_, __) => SizedBox(height: 10),
            itemBuilder: (context, index) {
              final token = state.tokens[index];
              final updated = token.updatedAt != null
                  ? DateFormat('dd/MM/yyyy HH:mm').format(token.updatedAt!)
                  : null;

              return Material(
                color: context.themeColors.surfaceRaised,
                borderRadius: BorderRadius.circular(14),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 14,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: context.themeColors.surfaceSheet,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(
                          _iconForPlatform(token.platform),
                          color: context.themeColors.onSurface,
                          size: 22,
                        ),
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              token.isCurrent
                                  ? '${token.platformLabel} (este dispositivo)'
                                  : token.platformLabel,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontWeight: FontWeight.w800,
                                color: context.themeColors.onSurface,
                              ),
                            ),
                            if (updated != null) ...[
                              SizedBox(height: 3),
                              Text(
                                'Ativo em $updated',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: context.themeColors.onSurfaceMuted,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (!token.isCurrent)
                        TextButton(
                          onPressed: () async {
                            await ref
                                .read(athleteActiveSessionsProvider.notifier)
                                .revokeToken(token.id);
                            if (context.mounted) {
                              showAppSnackBar(
                                context,
                                'Dispositivo removido das notificações push.',
                              );
                            }
                          },
                          child: Text(
                            'Revogar',
                            style: theme.textTheme.labelLarge?.copyWith(
                              color: AppColors.live,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  static IconData _iconForPlatform(String platform) {
    return switch (platform) {
      'ios' => Icons.phone_iphone_rounded,
      'android' => Icons.android_rounded,
      'web' => Icons.language_rounded,
      'macos' => Icons.laptop_mac_rounded,
      _ => Icons.devices_rounded,
    };
  }
}
