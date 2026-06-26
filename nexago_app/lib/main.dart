import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/time/nexago_event_timezone.dart';
import 'core/auth/auth_providers.dart';
import 'core/biometric/biometric_app_gate.dart';
import 'core/deep_link/deep_link_navigation.dart';
import 'core/notifications/notification_navigation.dart';
import 'core/notifications/notification_providers.dart';
import 'core/notifications/notification_service.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/system_ui_overlay_style.dart';
import 'core/theme/theme_mode_provider.dart';
import 'core/theme/theme_preferences_repository.dart';
import 'core/auth/role_preferences_repository.dart';
import 'core/auth/active_role_providers.dart';
import 'features/tournaments/data/tournament_registration_success_preferences_repository.dart';
import 'features/tournaments/domain/tournament_registration_success_preferences_providers.dart';
import 'firebase_options.dart';
import 'shared/constants/app_strings.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('pt_BR', null);
  await initializeNexagoEventTimezone();

  // Evita registrar o app default duas vezes. Nota: em iOS/Android, **Hot restart (R)**
  // pode quebrar canais nativos (Firebase, shared_preferences → `channel-error`).
  // Pare o app (q) e rode `flutter run` de novo; prefira Hot reload (r).
  // Após adicionar shared_preferences, faça um cold start (não só hot restart).
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  }

  // Observabilidade: captura crashes/erros não tratados. Em debug a coleta fica
  // desligada para não poluir o painel com erros de desenvolvimento.
  final crashlytics = FirebaseCrashlytics.instance;
  await crashlytics.setCrashlyticsCollectionEnabled(!kDebugMode);
  FlutterError.onError = crashlytics.recordFlutterFatalError;
  PlatformDispatcher.instance.onError = (error, stack) {
    crashlytics.recordError(error, stack, fatal: true);
    return true;
  };

  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

  final themePrefs = await ThemePreferencesRepository.create();
  final rolePrefs = await RolePreferencesRepository.create();
  final tournamentSuccessPrefs =
      await TournamentRegistrationSuccessPreferencesRepository.create();

  runApp(
    ProviderScope(
      overrides: [
        themePreferencesRepositoryProvider.overrideWithValue(themePrefs),
        rolePreferencesRepositoryProvider.overrideWithValue(rolePrefs),
        tournamentRegistrationSuccessPreferencesRepositoryProvider
            .overrideWithValue(tournamentSuccessPrefs),
      ],
      child: const NexagoApp(),
    ),
  );
}

class NexagoApp extends ConsumerStatefulWidget {
  const NexagoApp({super.key});

  @override
  ConsumerState<NexagoApp> createState() => _NexagoAppState();
}

class _NexagoAppState extends ConsumerState<NexagoApp> {
  ProviderSubscription<AsyncValue<User?>>? _authSub;
  StreamSubscription<Uri>? _deepLinkSub;

  @override
  void initState() {
    super.initState();
    Future<void>(() async {
      final notifications = ref.read(notificationServiceProvider);
      final router = ref.read(goRouterProvider);
      void handleNotificationTap(Map<String, dynamic> data) {
        debugPrint('Notification tap payload: $data');
        navigateFromNotificationData(data, router);
      }

      await notifications.initialize(
        onOpenMessage: (message) {
          debugPrint('FCM open payload: ${message.data}');
          navigateFromNotification(message, router);
        },
        onForegroundMessage: (message) {
          debugPrint('FCM foreground payload: ${message.data}');
        },
        onNotificationTap: handleNotificationTap,
      );

      await notifications.syncUserToken(ref.read(authProvider).valueOrNull?.uid);

      // Deep links: link inicial (app aberto via link)
      final appLinks = AppLinks();
      final initialLink = await appLinks.getInitialLink();
      if (initialLink != null) _handleDeepLink(initialLink);

      // Deep links: app já em execução
      _deepLinkSub = appLinks.uriLinkStream.listen(_handleDeepLink);
    });

    _authSub = ref.listenManual<AsyncValue<User?>>(
      authProvider,
      (previous, next) async {
        final notifications = ref.read(notificationServiceProvider);
        final nextUid = next.valueOrNull?.uid.trim();
        await notifications.syncUserToken(nextUid);
      },
    );
  }

  void _handleDeepLink(Uri uri) {
    navigateFromDeepLink(
      uri: uri,
      ref: ref,
      router: ref.read(goRouterProvider),
    );
  }

  @override
  void dispose() {
    _deepLinkSub?.cancel();
    _authSub?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(goRouterProvider);
    final themeMode = ref.watch(resolvedThemeModeProvider);

    return BiometricAppGate(
      child: MaterialApp.router(
        title: AppStrings.appName,
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: themeMode,
        builder: (context, child) {
          final brightness = Theme.of(context).brightness;
          return AnnotatedRegion<SystemUiOverlayStyle>(
            value: systemUiOverlayForBrightness(brightness),
            child: child ?? const SizedBox.shrink(),
          );
        },
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [
          Locale('pt', 'BR'),
          Locale('en'),
        ],
        routerConfig: router,
      ),
    );
  }
}
