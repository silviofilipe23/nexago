import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/story_share/organizer_story_share.dart';

/// Envio gravado por `sendStoriesToPhone` (functions/src/organizer-stories-share.ts).
Map<String, dynamic> _doc({Object? link = 'https://organizador.nexago.app/t/copa'}) => {
      'tournamentId': 't1',
      'tournamentName': 'Copa Verão',
      'categoryName': 'Feminino Open',
      'unitLabel': 'duplas',
      'pageCount': 2,
      'pagePaths': [
        'storyShares/u1/t1/s1/1.png',
        'storyShares/u1/t1/s1/2.png',
      ],
      'link': link,
      'expiresAt': Timestamp.fromDate(DateTime.utc(2026, 11, 4, 15)),
    };

void main() {
  group('OrganizerStoryShare.fromMap', () {
    test('lê o envio com as páginas na ordem', () {
      final share = OrganizerStoryShare.fromMap('s1', _doc())!;
      expect(share.id, 's1');
      expect(share.tournamentId, 't1');
      expect(share.tournamentName, 'Copa Verão');
      expect(share.categoryName, 'Feminino Open');
      expect(share.pagePaths.last, 'storyShares/u1/t1/s1/2.png');
      expect(share.pageCount, 2);
      expect(share.link, 'https://organizador.nexago.app/t/copa');
      expect(share.isExpiredAt(DateTime.utc(2026, 11, 4, 14, 59)), isFalse);
      expect(share.isExpiredAt(DateTime.utc(2026, 11, 4, 15)), isTrue);
    });

    test('sem link (inscrições fechadas) e sem rótulo caem nos padrões', () {
      final share = OrganizerStoryShare.fromMap(
        's1',
        {..._doc(link: null), 'unitLabel': null},
      )!;
      expect(share.link, isNull);
      expect(share.unitLabel, 'duplas');
    });

    test('doc ausente ou sem páginas é indisponível', () {
      expect(OrganizerStoryShare.fromMap('s1', null), isNull);
      expect(OrganizerStoryShare.fromMap('s1', {..._doc(), 'pagePaths': []}), isNull);
    });
  });

  test('botão: próximo story na ordem, singular e fim', () {
    expect(organizerStoryShareButtonLabel(pageCount: 1, nextPage: 0), 'Postar no story');
    expect(organizerStoryShareButtonLabel(pageCount: 3, nextPage: 1), 'Postar story 2/3');
    expect(organizerStoryShareButtonLabel(pageCount: 3, nextPage: null), 'Concluir');
  });

  test('passos: figurinha do link só com link; "o próximo" só com mais de um story', () {
    final many = organizerStoryShareSteps(OrganizerStoryShare.fromMap('s1', _doc())!);
    expect(many.first, contains('Postar story 1/2'));
    expect(many.any((s) => s.contains('“Link”')), isTrue);
    expect(many.last, contains('próximo'));

    final single = organizerStoryShareSteps(OrganizerStoryShare.fromMap('s1', {
      ..._doc(link: null),
      'pagePaths': ['storyShares/u1/t1/s1/1.png'],
    })!);
    expect(single, hasLength(2));
    expect(single.first, contains('Postar no story'));
  });
}
