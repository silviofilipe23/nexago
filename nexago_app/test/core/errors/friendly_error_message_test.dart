import 'dart:async';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/errors/friendly_error_message.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_prizes_page.dart';

/// Como as exceções do app (BookingException, PaymentException…): a mensagem
/// em PT sai no toString.
class _AppException implements Exception {
  const _AppException(this.message);
  final String message;
  @override
  String toString() => message;
}

String _msg(Object error) =>
    friendlyErrorMessage(error, action: 'Não foi possível cancelar');

void main() {
  group('friendlyErrorMessage', () {
    test('mensagem PT do servidor aparece como veio', () {
      expect(
        _msg(
          FirebaseFunctionsException(
            code: 'failed-precondition',
            message: 'A reserva não pode mais ser cancelada.',
          ),
        ),
        'Não foi possível cancelar. A reserva não pode mais ser cancelada.',
      );
    });

    test('sem internet ou servidor fora do ar vira "Sem conexão"', () {
      const offline =
          'Não foi possível cancelar. Sem conexão. Confira sua internet e '
          'tente de novo.';
      expect(
        _msg(FirebaseFunctionsException(code: 'unavailable', message: 'x')),
        offline,
      );
      expect(
        _msg(FirebaseException(plugin: 'cloud_firestore', code: 'unavailable')),
        offline,
      );
      expect(_msg(const SocketException('Failed host lookup')), offline);
      expect(_msg(TimeoutException('slow')), offline);
    });

    test('sessão expirada e falta de permissão têm texto próprio', () {
      expect(
        _msg(FirebaseFunctionsException(code: 'unauthenticated', message: '')),
        contains('Sua sessão expirou'),
      );
      expect(
        _msg(
          FirebaseException(plugin: 'cloud_firestore', code: 'permission-denied'),
        ),
        contains('Você não tem permissão'),
      );
    });

    test('código cru do servidor não vaza: "NOT FOUND", "INTERNAL"', () {
      // "NOT FOUND" é callable não publicada; "INTERNAL", erro sem mensagem.
      for (final error in [
        FirebaseFunctionsException(code: 'not-found', message: 'NOT FOUND'),
        FirebaseFunctionsException(code: 'internal', message: 'INTERNAL'),
        FirebaseFunctionsException(
          code: 'internal',
          message: 'Unhandled error RangeError: index out of range',
        ),
      ]) {
        expect(
          _msg(error),
          'Não foi possível cancelar. Tente de novo em instantes.',
        );
      }
    });

    test('exceções do app com frase em PT aparecem', () {
      expect(
        _msg(const _AppException('Horário já reservado por outra pessoa.')),
        'Não foi possível cancelar. Horário já reservado por outra pessoa.',
      );
      expect(
        _msg(Exception('Avaliação não encontrada.')),
        'Não foi possível cancelar. Avaliação não encontrada.',
      );
      expect(
        _msg(StateError('Usuário não autenticado.')),
        'Não foi possível cancelar. Usuário não autenticado.',
      );
    });

    test('erro interno do Dart ou texto técnico vira "Tente de novo"', () {
      for (final error in <Object>[
        StateError('No element'),
        Exception("type 'Null' is not a subtype of type 'String'"),
        const FormatException('Unexpected character'),
        Object(),
      ]) {
        expect(
          _msg(error),
          'Não foi possível cancelar. Tente de novo em instantes.',
        );
      }
    });

    test('com logReason e erro desconhecido, registra sem quebrar', () {
      expect(
        friendlyErrorMessage(
          StateError('No element'),
          action: 'Não foi possível salvar',
          logReason: 'teste:desconhecido',
        ),
        'Não foi possível salvar. Tente de novo em instantes.',
      );
    });
  });

  testWidgets('premiação com erro mostra a frase amigável, não o erro cru',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tournamentDetailProvider('t1').overrideWith(
            (ref) => Stream.error(
              FirebaseException(
                plugin: 'cloud_firestore',
                code: 'unavailable',
                message: 'The service is currently unavailable.',
              ),
            ),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const TournamentPrizesPage(tournamentId: 't1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(
      find.text(
        'Não foi possível carregar a premiação. Sem conexão. Confira sua '
        'internet e tente de novo.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('cloud_firestore'), findsNothing);
    expect(find.textContaining('unavailable'), findsNothing);
  });
}
