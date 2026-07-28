import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'app_update_config.dart';

/// Tela terminal de atualização obrigatória.
///
/// Sem saída: não há voltar, fechar nem "agora não". A única ação leva à loja.
class ForceUpdatePage extends StatelessWidget {
  const ForceUpdatePage({super.key, required this.config});

  final AppUpdateConfig config;

  static const String _androidPackage = 'br.com.nexago.nexago_app';
  static const String _playStoreUrl =
      'https://play.google.com/store/apps/details?id=$_androidPackage';
  static const String _appStoreUrl =
      'https://apps.apple.com/br/app/nexago/id6775555738';

  String get _storeUrl {
    final configured = config.storeUrl;
    if (configured != null) return configured;
    return defaultTargetPlatform == TargetPlatform.iOS
        ? _appStoreUrl
        : _playStoreUrl;
  }

  Future<void> _openStore() async {
    // No Android, `market://` abre direto o app da Play; se não houver Play
    // Store instalada, cai para o link web.
    if (defaultTargetPlatform == TargetPlatform.android &&
        config.storeUrl == null) {
      final market = Uri.parse('market://details?id=$_androidPackage');
      final opened =
          await launchUrl(market, mode: LaunchMode.externalApplication)
              .catchError((_) => false);
      if (opened) return;
    }
    await launchUrl(
      Uri.parse(_storeUrl),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: theme.colorScheme.surface,
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(24, 32, 24, 24 + bottomInset),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: Container(
                          width: 104,
                          height: 104,
                          decoration: BoxDecoration(
                            color: AppColors.brand.withValues(alpha: 0.12),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.system_update_rounded,
                            size: 52,
                            color: AppColors.brand,
                          ),
                        ),
                      ),
                      const SizedBox(height: 40),
                      Text(
                        config.title ?? 'Atualize o nexaGO',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.6,
                          height: 1.15,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        config.message ??
                            'Esta versão do app não é mais compatível. '
                                'Atualize para continuar usando o nexaGO.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: colors.onSurfaceMuted,
                          height: 1.5,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 48),
                      SizedBox(
                        width: double.infinity,
                        height: 54,
                        child: FilledButton(
                          onPressed: _openStore,
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.brand,
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                          child: const Text(
                            'Atualizar agora',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.2,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
