import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/account_deletion_error.dart';

void main() {
  group('friendlyAccountDeletionErrorFromCode', () {
    test(
      'preserva o aviso do servidor quando os dados já foram apagados mas '
      'a conta de acesso não pôde ser removida',
      () {
        final message = friendlyAccountDeletionErrorFromCode(
          code: 'internal',
          message: 'Seus dados foram apagados, mas a conta de acesso não '
              'pôde ser removida. Contate o suporte.',
        );
        expect(message, contains('Contate o suporte'));
        expect(message, isNot(contains('Tente novamente')));
      },
    );

    test('mostra a mensagem específica quando só a exclusão dos dados falha', () {
      final message = friendlyAccountDeletionErrorFromCode(
        code: 'internal',
        message: 'Não foi possível apagar seus dados agora. Tente novamente.',
      );
      expect(
        message,
        'Não foi possível apagar seus dados agora. Tente novamente.',
      );
    });

    test('cai no genérico quando "internal" chega sem mensagem do servidor', () {
      final message = friendlyAccountDeletionErrorFromCode(
        code: 'internal',
        message: null,
      );
      expect(message, 'Não foi possível excluir a conta agora. Tente novamente.');
    });

    test('sessão expirada pede novo login em vez do genérico', () {
      final message = friendlyAccountDeletionErrorFromCode(
        code: 'unauthenticated',
        message: 'Login necessário',
      );
      expect(message, 'Sua sessão expirou. Entre novamente para excluir a conta.');
    });

    for (final code in ['unavailable', 'deadline-exceeded']) {
      test(
        '$code mostra aviso de conectividade, ignorando o texto cru do SDK',
        () {
          final message = friendlyAccountDeletionErrorFromCode(
            code: code,
            message: 'UNAVAILABLE',
          );
          expect(message, 'Sem conexão. Verifique a internet e tente de novo.');
        },
      );
    }

    test('código desconhecido cai no fallback genérico', () {
      final message = friendlyAccountDeletionErrorFromCode(
        code: 'some-unmapped-code',
        message: 'texto técnico qualquer',
      );
      expect(message, 'Não foi possível excluir a conta agora. Tente novamente.');
    });
  });

  group('friendlyAccountDeletionError', () {
    test('extrai code/message de uma FirebaseException real', () {
      final error = FirebaseException(
        plugin: 'cloud_functions',
        code: 'internal',
        message: 'Seus dados foram apagados, mas a conta de acesso não '
            'pôde ser removida. Contate o suporte.',
      );
      expect(friendlyAccountDeletionError(error), contains('Contate o suporte'));
    });

    test('erro que não veio do Firebase cai no fallback genérico', () {
      expect(
        friendlyAccountDeletionError(Exception('falha desconhecida')),
        'Não foi possível excluir a conta agora. Tente novamente.',
      );
    });
  });
}
