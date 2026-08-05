import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/phone_verification_models.dart';

/// Verificação em andamento: o que é preciso guardar entre o envio do SMS e a
/// confirmação do código.
class PhoneVerificationSession {
  const PhoneVerificationSession({
    required this.verificationId,
    this.resendToken,
  });

  final String verificationId;

  /// Só existe no Android. Passado de volta em [PhoneVerificationService.sendCode]
  /// para o reenvio ser um reenvio de verdade, e não uma nova verificação
  /// (a web não tem equivalente — lá cada tentativa cria um reCAPTCHA novo).
  final int? resendToken;

  PhoneVerificationSession copyWith({String? verificationId, int? resendToken}) {
    return PhoneVerificationSession(
      verificationId: verificationId ?? this.verificationId,
      resendToken: resendToken ?? this.resendToken,
    );
  }
}

/// Fluxo de verificação de telefone por SMS (Firebase Phone Auth).
///
/// Equivale ao `PhoneVerificationService` do portal web, mas sobre a API
/// nativa: no mobile não existe `RecaptchaVerifier` — o Android atesta via
/// Play Integrity e o iOS via silent push (APNs), caindo num reCAPTCHA em
/// webview quando o push não está disponível.
///
/// A escrita de `phoneNumber`/`phoneVerified` em `users/{uid}` é sempre da
/// Cloud Function `confirmPhoneVerification`: as regras do Firestore proíbem
/// o client de gravar esses campos (anti-fraude — ver `firestore.rules`).
class PhoneVerificationService {
  PhoneVerificationService({
    FirebaseAuth? auth,
    FirebaseFunctions? functions,
  })  : _auth = auth ?? FirebaseAuth.instance,
        _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseAuth _auth;
  final FirebaseFunctions _functions;

  /// Tempo que o Android espera pela leitura automática do SMS antes de exigir
  /// digitação. Vale só para [onAutoVerified]; o usuário pode digitar antes.
  static const Duration autoRetrievalTimeout = Duration(seconds: 60);

  /// Dispara o SMS com o código.
  ///
  /// [onCodeSent] recebe a sessão para confirmar depois. [onAutoVerified] só
  /// dispara no Android, quando o sistema lê o SMS sozinho: nesse caso a
  /// verificação já terminou (credencial vinculada + backend confirmado) e o
  /// telefone verificado vem no callback.
  Future<void> sendCode({
    required String phoneNumberRaw,
    required void Function(PhoneVerificationSession session) onCodeSent,
    required void Function(Object error) onFailed,
    void Function(String phoneNumber)? onAutoVerified,
    int? resendToken,
  }) async {
    final phone = toE164Br(phoneNumberRaw);
    if (phone == null) {
      onFailed(
        FirebaseAuthException(
          code: 'invalid-phone-number',
          message: 'Número de telefone inválido.',
        ),
      );
      return;
    }

    await _auth.verifyPhoneNumber(
      phoneNumber: phone,
      timeout: autoRetrievalTimeout,
      forceResendingToken: resendToken,
      verificationCompleted: (credential) async {
        if (onAutoVerified == null) return;
        try {
          onAutoVerified(await _completeWithCredential(credential));
        } catch (error) {
          onFailed(error);
        }
      },
      verificationFailed: onFailed,
      codeSent: (verificationId, forceResendingToken) {
        onCodeSent(
          PhoneVerificationSession(
            verificationId: verificationId,
            resendToken: forceResendingToken,
          ),
        );
      },
      // A janela de leitura automática fechou: o `verificationId` final ainda
      // vale para confirmar o código digitado à mão.
      codeAutoRetrievalTimeout: (_) {},
    );
  }

  /// Confirma o código de 6 dígitos e devolve o telefone gravado no perfil.
  Future<String> confirmCode({
    required PhoneVerificationSession session,
    required String smsCode,
  }) {
    return _completeWithCredential(
      PhoneAuthProvider.credential(
        verificationId: session.verificationId,
        smsCode: smsCode,
      ),
    );
  }

  /// Vincula (ou troca) a credencial de telefone e manda o backend gravar.
  Future<String> _completeWithCredential(PhoneAuthCredential credential) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw FirebaseAuthException(
        code: 'user-not-found',
        message: 'Sessão expirada. Entre novamente.',
      );
    }

    switch (phoneLinkMethod(user.providerData.map((p) => p.providerId))) {
      case PhoneLinkMethod.link:
        await user.linkWithCredential(credential);
      case PhoneLinkMethod.update:
        await user.updatePhoneNumber(credential);
    }

    // Sem o reload, `providerData` continua sem o provider `phone` nesta
    // sessão e uma segunda verificação escolheria `link` de novo — que o
    // Firebase rejeitaria com `provider-already-linked`.
    await user.reload();

    return _confirmOnBackend();
  }

  /// `confirmPhoneVerification` copia o telefone já verificado pelo Firebase
  /// Auth para `users/{uid}` via Admin SDK e devolve o valor gravado (E.164).
  Future<String> _confirmOnBackend() async {
    final result = await _functions
        .httpsCallable('confirmPhoneVerification')
        .call<Map<String, dynamic>>();
    final phoneNumber = result.data['phoneNumber'] as String?;
    if (phoneNumber == null || phoneNumber.isEmpty) {
      throw FirebaseAuthException(
        code: 'invalid-verification-id',
        message: 'Não foi possível confirmar o telefone. Tente novamente.',
      );
    }
    return phoneNumber;
  }
}

final phoneVerificationServiceProvider = Provider<PhoneVerificationService>(
  (ref) => PhoneVerificationService(),
);
