import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/brand/nexa_hashtag.dart';

void main() {
  group('withNexaHashtag', () {
    test('acrescenta a hashtag ao fim da legenda', () {
      expect(
        withNexaHashtag('Silvio e Marcelo 2–0 João e Pedro'),
        'Silvio e Marcelo 2–0 João e Pedro #vamosnexa',
      );
    });

    // O funil `nexaShareText` acrescenta a hashtag em TODO compartilhamento de
    // texto: quem já monta a legenda com ela (ou passa pelo funil duas vezes)
    // não pode sair com a tag duplicada.
    test('não duplica quando a legenda já cita a hashtag', () {
      const text = 'Cheguei ao elo Lenda #vamosnexa';
      expect(withNexaHashtag(text), text);
    });

    test('ignora a caixa ao procurar a hashtag existente', () {
      const text = 'Campeões #VAMOSNEXA';
      expect(withNexaHashtag(text), text);
    });

    test('legenda vazia vira só a hashtag, sem espaço solto', () {
      expect(withNexaHashtag('   '), '#vamosnexa');
    });
  });
}
