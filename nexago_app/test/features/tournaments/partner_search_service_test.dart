// Regras de custo da busca de parceiro. Ver a spec: o mínimo de 3 letras é
// LOCAL — `kSearchMinPrefixLength` global continua 2 por causa do gerador de
// `keywords`, cujo backfill nunca rodou.
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/partner_search_service.dart';

void main() {
  group('mínimo de 3 letras', () {
    test('duas letras não busca', () {
      expect(isPartnerQueryLongEnough('ra'), isFalse);
    });

    test('três letras busca', () {
      expect(isPartnerQueryLongEnough('raf'), isTrue);
    });

    test('conta sobre o termo normalizado: pontuação não vale letra', () {
      expect(isPartnerQueryLongEnough('j.r'), isFalse);
    });

    test('acento não atrapalha a contagem', () {
      expect(isPartnerQueryLongEnough('joã'), isTrue);
    });

    test('espaços em volta não contam', () {
      expect(isPartnerQueryLongEnough('  ra  '), isFalse);
    });
  });

  group('tetos', () {
    test('a tela mostra no máximo 10', () {
      expect(PartnerSearchService.kDisplayLimit, 10);
    });

    test('pede 15 ao repositório para o filtro de gênero ter folga', () {
      expect(PartnerSearchService.kFetchLimit, 15);
    });
  });
}
