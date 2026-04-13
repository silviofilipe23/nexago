import 'package:firebase_auth/firebase_auth.dart';

/// Mensagens amigáveis para [FirebaseAuthException] (PT-BR).
String mapFirebaseAuthException(FirebaseAuthException e) {
  switch (e.code) {
    case 'invalid-email':
      return 'E-mail inválido.';
    case 'user-disabled':
      return 'Esta conta foi desativada.';
    case 'user-not-found':
      return 'Não encontramos uma conta com este e-mail.';
    case 'wrong-password':
      return 'Senha incorreta.';
    case 'invalid-credential':
    case 'invalid-verification-code':
    case 'invalid-verification-id':
      return 'Credenciais inválidas. Verifique e-mail e senha.';
    case 'email-already-in-use':
      return 'Este e-mail já está em uso.';
    case 'weak-password':
      return 'A senha é muito fraca. Use pelo menos 6 caracteres.';
    case 'operation-not-allowed':
      return 'Login com e-mail e senha não está habilitado no projeto.';
    case 'network-request-failed':
      return 'Falha de rede. Verifique sua conexão.';
    case 'too-many-requests':
      return 'Muitas tentativas. Tente novamente mais tarde.';
    default:
      return e.message?.isNotEmpty == true
          ? e.message!
          : 'Não foi possível concluir a operação (${e.code}).';
  }
}
