import 'dart:async';

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

/// Usuário com token pronto para leituras Firestore autenticadas.
///
/// Diferente de [authProvider.future], reage a login/logout e garante
/// `getIdToken()` antes de queries em `public_profiles`.
final firestoreAuthUserProvider = StreamProvider<User?>((ref) async* {
  final auth = ref.watch(firebaseAuthProvider);
  await for (final user in auth.idTokenChanges()) {
    if (user != null) {
      try {
        await user.getIdToken();
      } catch (_) {
        // Token indisponível — segue com o usuário; Firestore revalida.
      }
    }
    yield user;
  }
});

/// Aguarda sessão restaurada e token propagado antes de listar `public_profiles`.
Future<User?> readFirestoreReadyUser(Ref ref) async {
  final auth = ref.read(firebaseAuthProvider);
  final immediate = auth.currentUser;
  if (immediate != null) {
    try {
      await immediate.getIdToken();
    } catch (_) {}
    return immediate;
  }

  try {
    final user = await auth
        .authStateChanges()
        .firstWhere((user) => user != null)
        .timeout(const Duration(seconds: 8));
    if (user != null) {
      try {
        await user.getIdToken();
      } catch (_) {}
    }
    return user;
  } on TimeoutException {
    final fallback = auth.currentUser;
    if (fallback != null) {
      try {
        await fallback.getIdToken();
      } catch (_) {}
    }
    return fallback;
  }
}

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
