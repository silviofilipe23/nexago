import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/pix_brcode.dart';

/// Implementação de referência (CRC-16/CCITT-FALSE) para validar a do app.
String refCrc16(String payload) {
  const polynomial = 0x1021;
  var crc = 0xFFFF;
  for (final byte in payload.codeUnits) {
    crc ^= byte << 8;
    for (var i = 0; i < 8; i++) {
      crc = (crc & 0x8000) != 0 ? (crc << 1) ^ polynomial : crc << 1;
      crc &= 0xFFFF;
    }
  }
  return crc.toRadixString(16).toUpperCase().padLeft(4, '0');
}

void main() {
  group('PixBrCode.build', () {
    test('CRC-16/CCITT-FALSE bate com o vetor padrão (123456789 → 29B1)', () {
      expect(refCrc16('123456789'), '29B1');
    });

    test('estrutura EMV básica', () {
      final code = PixBrCode.build(
        key: 'organizador@email.com',
        recipientName: 'Maria Souza',
        city: 'Goiânia',
        amount: 160,
        txid: 'COPA2026',
      );
      expect(code.startsWith('000201'), isTrue);
      expect(code.contains('br.gov.bcb.pix'), isTrue);
      expect(code.contains('organizador@email.com'), isTrue);
      expect(code.contains('5303986'), isTrue); // moeda BRL
      expect(code.contains('5406160.00'), isTrue); // valor 160,00
      expect(code.contains('5802BR'), isTrue);
    });

    test('CRC final é consistente e usa o algoritmo correto', () {
      final code = PixBrCode.build(
        key: '+5562999999999',
        recipientName: 'Joao Atleta',
        city: 'BRASILIA',
        amount: 80,
        txid: '***',
      );
      // Tudo menos os 4 últimos chars; deve terminar em "6304" + CRC.
      final withoutCrc = code.substring(0, code.length - 4);
      expect(withoutCrc.endsWith('6304'), isTrue);
      final crc = code.substring(code.length - 4);
      expect(crc, refCrc16(withoutCrc));
    });

    test('valor <= 0 omite o campo 54', () {
      final code = PixBrCode.build(
        key: 'chave',
        recipientName: 'X',
        amount: 0,
      );
      expect(code.contains('5303986'), isTrue);
      expect(RegExp(r'54\d{2}').hasMatch(code.replaceAll('5802BR', '')), isFalse);
    });

    test('valor com centavos formata com 2 casas', () {
      final code = PixBrCode.build(
        key: 'chave',
        recipientName: 'X',
        amount: 99.9,
      );
      expect(code.contains('540599.90'), isTrue);
    });

    test('remove acentos e caixa do nome/cidade', () {
      final code = PixBrCode.build(
        key: 'chave',
        recipientName: 'José Antônio',
        city: 'São Paulo',
        amount: 10,
      );
      expect(code.contains('JOSE ANTONIO'), isTrue);
      expect(code.contains('SAO PAULO'), isTrue);
    });

    test('txid vazio vira ***', () {
      final code = PixBrCode.build(
        key: 'chave',
        recipientName: 'X',
        amount: 10,
        txid: '',
      );
      expect(code.contains('0503***'), isTrue);
    });
  });
}
