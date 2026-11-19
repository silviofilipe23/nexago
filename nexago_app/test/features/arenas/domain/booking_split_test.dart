import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/booking_split.dart';

// "Dividir com os jogadores": a conta em centavos tem de bater com a do
// servidor (`validateSplitShares` em functions/src/arena-booking-split.ts),
// senão a callable recusa a divisão por R$ 0,01.

BookingSplitParticipant _p(String id, double amount, {bool self = false}) =>
    BookingSplitParticipant(
      athleteId: id,
      name: 'Atleta $id',
      amountReais: amount,
      isSelf: self,
    );

void main() {
  group('splitEvenlyReais', () {
    test('resto dos centavos vai para as primeiras fatias e a soma bate', () {
      final parts = splitEvenlyReais(100, 3);
      expect(parts, [33.34, 33.33, 33.33]);
      expect(splitSumReais(parts), 100);
    });

    test('divisão exata fica igual', () {
      expect(splitEvenlyReais(70, 4), [17.5, 17.5, 17.5, 17.5]);
    });

    test('valor quebrado: 0,05 em 3', () {
      final parts = splitEvenlyReais(0.05, 3);
      expect(parts, [0.02, 0.02, 0.01]);
      expect(splitSumReais(parts), 0.05);
    });

    test('ponto flutuante não perde centavo (0,1 + 0,2)', () {
      final parts = splitEvenlyReais(0.3, 2);
      expect(parts, [0.15, 0.15]);
    });

    test('20 pessoas em R\$ 123,45 somam exatamente', () {
      final parts = splitEvenlyReais(123.45, kBookingSplitMaxShares);
      expect(parts, hasLength(20));
      expect(splitSumReais(parts), 123.45);
      expect(parts.toSet(), {6.18, 6.17});
    });

    test('ninguém: lista vazia', () {
      expect(splitEvenlyReais(70, 0), isEmpty);
    });
  });

  group('splitSumMatches', () {
    test('aceita até 2 centavos de diferença, como o servidor', () {
      expect(splitSumMatches([35, 35.02], 70), isTrue);
      expect(splitSumMatches([35, 34.98], 70), isTrue);
    });

    test('3 centavos fora recusa', () {
      expect(splitSumMatches([35, 35.03], 70), isFalse);
    });

    test('soma muito abaixo recusa', () {
      expect(splitSumMatches([20, 20], 70), isFalse);
    });
  });

  group('parseReaisInput', () {
    test('vírgula decimal', () => expect(parseReaisInput('12,50'), 12.5));
    test('ponto decimal', () => expect(parseReaisInput('12.5'), 12.5));
    test(
        'milhar com ponto', () => expect(parseReaisInput('1.234,56'), 1234.56));
    test('com R\$', () => expect(parseReaisInput('R\$ 8,00'), 8));
    test('vazio vale 0', () => expect(parseReaisInput(''), 0));
    test('lixo vale 0', () => expect(parseReaisInput(',,'), 0));
    test('arredonda ao centavo', () => expect(parseReaisInput('1,999'), 2));
    test('formata de volta com vírgula',
        () => expect(formatReaisInput(17.5), '17,50'));
  });

  group('BookingSplitDraft', () {
    test('só "Você" não pode enviar', () {
      final draft = BookingSplitDraft(participants: [_p('me', 70, self: true)]);
      expect(draft.canSubmit(70), isFalse);
    });

    test('você + 1 com a soma certa pode enviar', () {
      final draft = BookingSplitDraft(participants: [
        _p('me', 35, self: true),
        _p('a', 35),
      ]);
      expect(draft.canSubmit(70), isTrue);
      expect(draft.summaryLabel, 'Você + 1 jogador');
      expect(draft.payerNames, {'me': 'Você', 'a': 'Atleta a'});
    });

    test('alguém com R\$ 0 trava o envio mesmo com a soma certa', () {
      final draft = BookingSplitDraft(participants: [
        _p('me', 70, self: true),
        _p('a', 0),
      ]);
      expect(draft.canSubmit(70), isFalse);
    });

    test('mais de 20 pessoas trava', () {
      final parts = splitEvenlyReais(210, 21);
      final draft = BookingSplitDraft(participants: [
        for (var i = 0; i < 21; i++) _p('a$i', parts[i]),
      ]);
      expect(draft.canSubmit(210), isFalse);
    });

    test('sem "Você": rótulo só com os jogadores', () {
      final draft = BookingSplitDraft(participants: [
        _p('a', 35),
        _p('b', 35),
      ]);
      expect(draft.summaryLabel, '2 jogadores');
    });

    test('divisão igual é refeita sobre o valor final da reserva', () {
      // Montada sobre R$ 70; o cupom deixou a reserva em R$ 63.
      final draft = BookingSplitDraft(participants: [
        _p('me', 35, self: true),
        _p('a', 35),
      ]);
      final shares = draft.sharesFor(63)!;
      expect(shares.map((s) => s.amountReais), [31.5, 31.5]);
      expect(shares.map((s) => s.athleteId), ['me', 'a']);
    });

    test('valores ajustados à mão que não somam mais o total: null', () {
      final draft = BookingSplitDraft(
        participants: [_p('me', 50, self: true), _p('a', 20)],
        evenly: false,
      );
      expect(draft.sharesFor(70), isNotNull);
      expect(draft.sharesFor(63), isNull);
    });
  });

  group('BookingPaymentShare.fromMap', () {
    test('lê o doc do servidor', () {
      final share = BookingPaymentShare.fromMap('s1', {
        'payerAthleteId': 'a',
        'amountReais': 35,
        'status': 'covered_by_organizer',
        'pixCopyPaste': '000201...',
        'qrCodeBase64': 'iVBOR',
        'expiresAt': DateTime(2030, 11, 8, 17),
      });
      expect(share.payerAthleteId, 'a');
      expect(share.amountReais, 35.0);
      expect(share.status, BookingShareStatus.coveredByOrganizer);
      expect(share.status.label, 'Virou sua conta');
      expect(share.expiresAt, DateTime(2030, 11, 8, 17));
      expect(share.isPending, isFalse);
    });

    test('campo faltando ou de tipo errado não quebra', () {
      final share = BookingPaymentShare.fromMap('s2', {
        'amountReais': 'trinta',
        'status': 42,
        'expiresAt': 'amanhã',
        'pixCopyPaste': '  ',
      });
      expect(share.payerAthleteId, '');
      expect(share.amountReais, 0);
      expect(share.status, BookingShareStatus.pending);
      expect(share.expiresAt, isNull);
      expect(share.pixCopyPaste, isNull);
    });

    test('rótulos de status iguais aos do web', () {
      expect(BookingShareStatus.parse('paid').label, 'Pago');
      expect(BookingShareStatus.parse('expired').label, 'Expirado');
      expect(BookingShareStatus.parse('pending').label, 'Aguardando');
    });
  });

  test('progresso conta quem pagou e o que virou conta do dono', () {
    final progress = BookingSplitProgress([
      BookingPaymentShare.fromMap(
          '1', {'amountReais': 23.34, 'status': 'paid'}),
      BookingPaymentShare.fromMap(
          '2', {'amountReais': 23.33, 'status': 'pending'}),
      BookingPaymentShare.fromMap(
        '3',
        {'amountReais': 23.33, 'status': 'covered_by_organizer'},
      ),
    ]);
    expect(progress.label, '1 de 3 pagaram');
    expect(progress.pending, 1);
    expect(progress.paidReais, 23.34);
    expect(progress.coveredReais, 23.33);
  });

  test('mensagem para o jogador leva valor e Pix copia e cola', () {
    final text = bookingShareMessage(
      arenaName: 'Arena CFC',
      amountReais: 17.5,
      pixCopyPaste: '000201PIX',
      whenLabel: '8 nov 2030, 19:00',
    );
    expect(text, contains('Arena CFC (8 nov 2030, 19:00): R\$ 17,50.'));
    expect(text, endsWith('000201PIX'));
  });
}
