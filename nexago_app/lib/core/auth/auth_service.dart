import 'package:firebase_auth/firebase_auth.dart';

/// Serviço de autenticação baseado em [FirebaseAuth].
///
/// A persistência de sessão é tratada pelo SDK (armazenamento local no mobile
/// e web); não é necessário código extra para manter o usuário logado.
class AuthService {
  AuthService(this._auth);

  final FirebaseAuth _auth;

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

  Future<void> signOut() => _auth.signOut();

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
}
