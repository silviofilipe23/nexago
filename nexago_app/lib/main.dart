import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/auth/auth_providers.dart';
import 'core/biometric/biometric_app_gate.dart';
import 'core/notifications/notification_navigation.dart';
import 'core/notifications/notification_providers.dart';
import 'core/notifications/notification_service.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'firebase_options.dart';
import 'shared/constants/app_strings.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('pt_BR', null);

  // Evita registrar o app default duas vezes. Nota: em iOS/Android, **Hot restart (R)**
  // pode quebrar o canal nativo do Firebase (`PlatformException channel-error`).
  // Nesse caso, pare o app (q) e rode `flutter run` de novo; prefira Hot reload (r).
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  }
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

  runApp(
    const ProviderScope(
      child: NexagoApp(),
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

  @override
  void initState() {
    super.initState();
    Future<void>(() async {
      final notifications = ref.read(notificationServiceProvider);
      final router = ref.read(goRouterProvider);
      await notifications.initialize(
        onOpenMessage: (message) {
          debugPrint('FCM open payload: ${message.data}');
          navigateFromNotification(message, router);
        },
        onForegroundMessage: (message) {
          debugPrint('FCM foreground payload: ${message.data}');
        },
      );

      await notifications.syncUserToken(ref.read(authProvider).valueOrNull?.uid);
    });

    _authSub = ref.listenManual<AsyncValue<User?>>(
      authProvider,
      (previous, next) async {
        await ref
            .read(notificationServiceProvider)
            .syncUserToken(next.valueOrNull?.uid);
      },
    );
  }

  @override
  void dispose() {
    _authSub?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(goRouterProvider);

    return BiometricAppGate(
      child: MaterialApp.router(
        title: AppStrings.appName,
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
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
