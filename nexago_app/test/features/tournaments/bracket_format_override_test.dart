import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_document_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_logic.dart';

Map<String, dynamic> _doc({
  String declared = '',
  String? override,
}) {
  return {
    'name': 'Torneio 5cat seed nexaGO',
    'categories': [
      {'id': 'cat-a', 'categoryName': 'Masculina A', 'bracketFormat': declared},
    ],
    if (override != null)
      'categoryOps': {
        'cat-a': {'bracketStatus': 'published', 'bracketFormatOverride': override},
      },
  };
}

String _formatOf(Map<String, dynamic> data) =>
    TournamentDocumentMapper.detailFromMap('t1', data).categoryOffers.single
        .bracketFormat;

void main() {
  group('effectiveBracketFormat', () {
    test('o override vence o declarado', () {
      expect(
        effectiveBracketFormat(
          declared: 'groups_knockout',
          override: 'double_elimination',
        ),
        'double_elimination',
      );
    });

    test('sem override, o declarado vale', () {
      expect(
        effectiveBracketFormat(declared: 'groups_knockout', override: ''),
        'groups_knockout',
      );
    });

    test('override em branco não apaga o declarado', () {
      expect(
        effectiveBracketFormat(declared: 'groups_knockout', override: '   '),
        'groups_knockout',
      );
    });
  });

  group('mapper', () {
    // O caso do "Torneio 5cat seed nexaGO": a categoria não declara formato
    // nenhum, e a chave foi publicada como dupla eliminação. Antes o atleta
    // via GRUPO no Focus porque só o campo declarado era lido.
    test('categoria sem formato declarado herda o da chave publicada', () {
      final format = _formatOf(_doc(override: 'double_elimination'));

      expect(isDoubleEliminationBracketFormat(format), isTrue);
      expect(bracketFormatHasGroupsPhase(format), isFalse);
      expect(bracketFormatLabel(format), 'Dupla eliminatória');
    });

    test('chave gerada como DE corrige a categoria declarada como grupos', () {
      final format = _formatOf(
        _doc(declared: 'groups_knockout', override: 'double_elimination'),
      );

      expect(isDoubleEliminationBracketFormat(format), isTrue);
      expect(bracketFormatHasGroupsPhase(format), isFalse);
    });

    test('sem chave publicada, o declarado segue mandando', () {
      final format = _formatOf(_doc(declared: 'groups_knockout'));

      expect(isDoubleEliminationBracketFormat(format), isFalse);
      expect(bracketFormatHasGroupsPhase(format), isTrue);
    });

    test('categoryOps de outra categoria não contamina', () {
      final data = _doc(declared: 'groups_knockout');
      data['categoryOps'] = {
        'cat-OUTRA': {'bracketFormatOverride': 'double_elimination'},
      };

      expect(isDoubleEliminationBracketFormat(_formatOf(data)), isFalse);
    });

    test('categoryOps malformado não derruba o mapper', () {
      final data = _doc(declared: 'groups_knockout');
      data['categoryOps'] = 'lixo';

      expect(_formatOf(data), 'groups_knockout');
    });
  });
}
