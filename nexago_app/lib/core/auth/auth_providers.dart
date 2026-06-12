import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../notifications/notification_providers.dart';
import 'auth_service.dart';

final firebaseAuthProvider = Provider<FirebaseAuth>((ref) {
  return FirebaseAuth.instance;
});

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(ref.watch(firebaseAuthProvider));
});

/// Estado de autenticação reativo (usuário atual ou null; atualiza em login/logout).
final authProvider = StreamProvider<User?>((ref) {
  return ref.watch(authServiceProvider).authStateChanges();
});

/// Logout com remoção do token FCM do dispositivo (exige auth ainda ativo).
final appSignOutProvider = Provider<Future<void> Function()>((ref) {
  return () async {
    final notifications = ref.read(notificationServiceProvider);
    final uid = ref.read(firebaseAuthProvider).currentUser?.uid.trim();
    if (uid != null && uid.isNotEmpty) {
      await notifications.clearCurrentDeviceToken(uid);
      notifications.cancelApnsRetry();
    }
    await ref.read(authServiceProvider).signOut();
  };
});
