import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';

void main() {
  group('callableErrorMessage', () {
    const fallback = 'Não foi possível enviar o convite de substituição.';

    test('descrição genérica do SDK iOS vira o fallback em português', () {
      // Callable inexistente no projeto → 404 → o SDK nativo preenche
      // `message` com a descrição do código ("NOT FOUND" no iOS).
      expect(
        callableErrorMessage('not-found', 'NOT FOUND', fallback),
        fallback,
      );
    });

    test('descrição genérica do SDK Android vira o fallback', () {
      expect(
        callableErrorMessage('not-found', 'NOT_FOUND', fallback),
        fallback,
      );
    });

    test('backend fora do ar (unavailable) também cai no fallback', () {
      expect(
        callableErrorMessage('unavailable', 'UNAVAILABLE', fallback),
        fallback,
      );
    });

    test('mensagem nula cai no fallback', () {
      expect(callableErrorMessage('internal', null, fallback), fallback);
    });

    test('mensagem em branco cai no fallback', () {
      expect(callableErrorMessage('internal', '   ', fallback), fallback);
    });

    test('mensagem de regra de negócio do servidor é preservada', () {
      const serverMessage = 'As chaves já foram publicadas.';
      expect(
        callableErrorMessage('failed-precondition', serverMessage, fallback),
        serverMessage,
      );
    });

    test('not-found COM mensagem do servidor é preservado', () {
      // O servidor também usa `not-found` com copy própria — só a descrição
      // genérica do SDK é que precisa ser trocada.
      const serverMessage = 'Inscrição não encontrada.';
      expect(
        callableErrorMessage('not-found', serverMessage, fallback),
        serverMessage,
      );
    });
  });
}
