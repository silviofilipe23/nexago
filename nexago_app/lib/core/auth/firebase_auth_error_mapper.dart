import 'package:firebase_auth/firebase_auth.dart';

/// Campo de destino para feedback de erro de autenticação.
enum AuthErrorField { email, password, form }

/// Classifica um [FirebaseAuthException] para exibir o erro no campo certo
/// (inline e persistente) ou, quando sistêmico, em nível de formulário.
({AuthErrorField field, String message}) classifyFirebaseAuthError(
  FirebaseAuthException e,
) {
  final message = mapFirebaseAuthException(e);
  switch (e.code) {
    case 'invalid-email':
    case 'user-not-found':
      return (field: AuthErrorField.email, message: message);
    case 'wrong-password':
    case 'invalid-credential':
      return (field: AuthErrorField.password, message: message);
    default:
      return (field: AuthErrorField.form, message: message);
  }
}

/// Mensagens amigáveis para [FirebaseAuthException] (PT-BR).
///
/// Para códigos desconhecidos cai na mensagem crua do SDK — que vem em inglês.
/// Quem não quiser esse vazamento deve usar [tryMapFirebaseAuthException] e
/// decidir o próprio texto de fallback.
String mapFirebaseAuthException(FirebaseAuthException e) {
  return tryMapFirebaseAuthException(e) ??
      (e.message?.isNotEmpty == true
          ? e.message!
          : 'Não foi possível concluir a operação (${e.code}).');
}

/// Igual a [mapFirebaseAuthException], mas devolve `null` quando o código não
/// tem tradução — deixando o chamador escolher o fallback em vez de expor o
/// texto do SDK ao usuário.
String? tryMapFirebaseAuthException(FirebaseAuthException e) {
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
    // Verificação de telefone por SMS (Firebase Phone Auth). Mensagens
    // alinhadas com o portal web (`firebase-auth-errors.ts`); os dois últimos
    // códigos só ocorrem no mobile e não têm equivalente lá.
    case 'invalid-verification-code':
      return 'Código incorreto. Confira os 6 dígitos e tente de novo.';
    case 'invalid-verification-id':
    case 'session-expired':
      return 'Essa verificação expirou. Peça um novo código.';
    case 'invalid-phone-number':
      return 'Número de telefone inválido.';
    case 'quota-exceeded':
      return 'Limite de envios de SMS atingido. Tente novamente mais tarde.';
    case 'credential-already-in-use':
      return 'Este número já está vinculado a outra conta.';
    case 'provider-already-linked':
      return 'Esta conta já tem um telefone vinculado.';
    case 'captcha-check-failed':
      return 'Não foi possível confirmar que você não é um robô. Tente novamente.';
    case 'web-context-cancelled':
      return 'Verificação cancelada. Tente novamente.';
    // Falha na verificação do app antes de enviar o SMS: Play Integrity no
    // Android, push silencioso APNs no iOS (com fallback de reCAPTCHA). É
    // configuração do projeto, não algo que o usuário resolva sozinho — e no
    // Simulador do iOS acontece sempre, porque ele não recebe push remoto.
    case 'missing-client-identifier':
    case 'app-not-verified':
    case 'app-not-authorized':
      return 'Não foi possível validar o app para envio de SMS. '
          'Tente novamente ou fale com o suporte.';
    default:
      return null;
  }
}
