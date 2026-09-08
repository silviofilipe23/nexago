import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/followed_matches_repository.dart';

void main() {
  group('fnv1a32', () {
    test('reproduz exatamente os vetores do backend', () {
      // Estes MESMOS pares estão em `functions/src/match-live-follow-notify.test.ts`.
      // Se um lado mudar, o outro quebra. Sem isso a divergência só apareceria
      // em quadra: o push iria para um tópico que ninguém assina, sem erro em
      // lugar nenhum.
      expect(fnv1a32('a/b'), 'g8wk3l');
      expect(fnv1a32('a b'), '4m7u2a');
      expect(fnv1a32('partida com espaço'), 'lfqgei');
      expect(fnv1a32('m1'), '15454vf');
    });

    test('não estoura 32 bits em entrada longa', () {
      final hash = fnv1a32('x' * 500);

      expect(int.parse(hash, radix: 36), lessThanOrEqualTo(0xffffffff));
      expect(int.parse(hash, radix: 36), greaterThanOrEqualTo(0));
    });
  });

  group('matchTopicName', () {
    test('id normal vira tópico por plataforma', () {
      expect(matchTopicName('abc123', ios: false), 'match-abc123-android');
      expect(matchTopicName('abc123', ios: true), 'match-abc123-ios');
    });

    test('bate com o nome que o backend monta para id sujo', () {
      // Espelha `tópico de id sujo é o id saneado mais o hash do original`.
      expect(matchTopicName('a/b', ios: false), 'match-a_b.g8wk3l-android');
      expect(matchTopicName('a b', ios: true), 'match-a_b.4m7u2a-ios');
    });

    test('ids que só diferem no caractere inválido NÃO colidem', () {
      expect(
        matchTopicName('a/b', ios: false),
        isNot(matchTopicName('a b', ios: false)),
      );
    });

    test('resultado é sempre válido para o FCM', () {
      final safe = RegExp(r'^[a-zA-Z0-9\-_.~%]+$');

      for (final id in ['abc123', 'a/b', 'com espaço', 'acentuação#1']) {
        expect(safe.hasMatch(matchTopicName(id, ios: false)), isTrue, reason: id);
        expect(safe.hasMatch(matchTopicName(id, ios: true)), isTrue, reason: id);
      }
    });

    test('recusa matchId vazio em vez de montar tópico inútil', () {
      expect(() => matchTopicName('   ', ios: false), throwsArgumentError);
    });

    test('Android e iOS nunca compartilham tópico', () {
      // Compartilhar faria o iOS receber a mensagem data-only (que ele não
      // sabe exibir) e o Android receber alerta duplicado.
      expect(
        matchTopicName('abc123', ios: false),
        isNot(matchTopicName('abc123', ios: true)),
      );
    });
  });
}
