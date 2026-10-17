import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/data/squad_attribution_service.dart';

void main() {
  group('squadRefFromUri', () {
    test('lê o código do link e marca QR pelo via=qr', () {
      expect(
        squadRefFromUri(
            Uri.parse('https://nexago.com.br/torneios/t1?squad=joao10')),
        const SquadRef(code: 'JOAO10', origin: 'link'),
      );
      expect(
        squadRefFromUri(Uri.parse('nexago://torneios?squad=RAYSSA&via=qr')),
        const SquadRef(code: 'RAYSSA', origin: 'qr'),
      );
    });

    test('sem parâmetro ou com código inválido, nada', () {
      expect(squadRefFromUri(Uri.parse('https://nexago.com.br/torneios/t1')),
          isNull);
      expect(squadRefFromUri(Uri.parse('https://nexago.com.br/?squad=jo')),
          isNull);
      expect(squadRefFromUri(Uri.parse('https://nexago.com.br/?squad=JOÃO-10')),
          isNull);
    });
  });
}
