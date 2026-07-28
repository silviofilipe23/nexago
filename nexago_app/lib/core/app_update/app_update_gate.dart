import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme/app_theme.dart';
import '../theme/theme_mode_provider.dart';
import '../../shared/constants/app_strings.dart';
import 'app_update_providers.dart';
import 'force_update_page.dart';

/// Substitui o app inteiro pela tela de atualização obrigatória quando a build
/// instalada está abaixo da mínima publicada em `appConfig/appVersion`.
///
/// Fica como widget mais externo (acima do router e do gate biométrico) de
/// propósito: bloqueado, nenhuma rota do app chega a ser construída.
///
/// Enquanto a config e a versão instalada carregam, o app roda normalmente —
/// a checagem nunca segura a inicialização.
class AppUpdateGate extends ConsumerWidget {
  const AppUpdateGate({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(forcedUpdateRequiredProvider)) {
      return child;
    }

    return MaterialApp(
      title: AppStrings.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ref.watch(resolvedThemeModeProvider),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('pt', 'BR'),
        Locale('en'),
      ],
      home: ForceUpdatePage(
        config: ref.watch(effectiveAppUpdateConfigProvider),
      ),
    );
  }
}
