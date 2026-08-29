import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform, visibleForTesting;
import 'package:google_sign_in/google_sign_in.dart';

import '../../firebase_options.dart';

/// Serviço de autenticação baseado em [FirebaseAuth].
///
/// A persistência de sessão é tratada pelo SDK (armazenamento local no mobile
/// e web); não é necessário código extra para manter o usuário logado.
class AuthService {
  AuthService(this._auth);

  final FirebaseAuth _auth;

  /// Web client ID do Firebase (necessário para [idToken] no login com Google).
  ///
  /// Precisa ser o OAuth client de tipo **Web** do projeto (o mesmo
  /// `client_type: 3` do `android/app/google-services.json`); no Android o
  /// Google Sign-In rejeita ids de outros tipos com `ApiException: 10` logo
  /// após a seleção da conta.
  @visibleForTesting
  static const String firebaseWebClientId =
      '735357850346-qj66e686fe315k1o588gr4c2e0bkleir.apps.googleusercontent.com';

  late final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: const <String>['email'],
    clientId: _appleGoogleClientId,
    serverClientId: firebaseWebClientId,
  );

  static String? get _appleGoogleClientId {
    if (kIsWeb) return null;
    switch (defaultTargetPlatform) {
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
        return DefaultFirebaseOptions.ios.iosClientId;
      default:
        return null;
    }
  }

  Stream<User?> authStateChanges() => _auth.authStateChanges();

  User? get currentUser => _auth.currentUser;

  Future<UserCredential> signInWithEmailAndPassword({
    required String email,
    required String password,
  }) {
    return _auth.signInWithEmailAndPassword(
      email: email.trim(),
      password: password,
    );
  }

  Future<UserCredential> registerWithEmailAndPassword({
    required String email,
    required String password,
  }) {
    return _auth.createUserWithEmailAndPassword(
      email: email.trim(),
      password: password,
    );
  }

  Future<void> signOut() async {
    await Future.wait<void>([
      _auth.signOut(),
      _googleSignIn.signOut(),
    ]);
  }

  /// Login com Google. Retorna `null` se o usuário cancelar o fluxo.
  Future<UserCredential?> signInWithGoogle() async {
    final account = await _googleSignIn.signIn();
    if (account == null) return null;

    final googleAuth = await account.authentication;
    final idToken = googleAuth.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw FirebaseAuthException(
        code: 'missing-google-id-token',
        message:
            'Não foi possível obter o token do Google. Verifique o OAuth no console Firebase.',
      );
    }

    final credential = GoogleAuthProvider.credential(
      accessToken: googleAuth.accessToken,
      idToken: idToken,
    );
    return _auth.signInWithCredential(credential);
  }

  Future<void> sendPasswordResetEmail({
    required String email,
  }) {
    return _auth.sendPasswordResetEmail(email: email.trim());
  }

  /// Envia e-mail de verificação para o usuário recém-cadastrado.
  Future<void> sendEmailVerification() async {
    final user = _auth.currentUser;
    if (user != null && !user.emailVerified) {
      await user.sendEmailVerification();
    }
  }

  /// Reautenticação com e-mail/senha (ex.: desbloqueio quando Face ID não é usado).
  Future<void> reauthenticateWithEmailAndPassword({
    required String email,
    required String password,
  }) {
    final user = _auth.currentUser;
    if (user == null) {
      throw StateError('Nenhum usuário autenticado.');
    }
    final cred = EmailAuthProvider.credential(
      email: email.trim(),
      password: password,
    );
    return user.reauthenticateWithCredential(cred);
  }

  /// Atualiza senha após reautenticação (contas e-mail/senha).
  Future<void> updatePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw StateError('Nenhum usuário autenticado.');
    }
    final email = user.email;
    if (email == null || email.isEmpty) {
      throw FirebaseAuthException(
        code: 'missing-email',
        message: 'Conta sem e-mail para reautenticação.',
      );
    }
    await reauthenticateWithEmailAndPassword(
      email: email,
      password: currentPassword,
    );
    await user.updatePassword(newPassword);
  }

  bool get hasPasswordProvider {
    final user = _auth.currentUser;
    if (user == null) return false;
    return user.providerData.any((p) => p.providerId == 'password');
  }
}
