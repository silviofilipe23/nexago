import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/athlete_search_results.dart';
import 'package:nexago_app/core/search/search_keywords.dart';

AthleteSearchDoc doc(
  String uid, {
  String? fullName,
  String? nickname,
  List<String>? keywords,
  bool athleteFlag = true,
  List<String> roles = const ['athlete'],
}) {
  return AthleteSearchDoc.fromMap(uid, {
    if (fullName != null) 'fullName': fullName,
    if (nickname != null) 'nickname': nickname,
    'keywords': keywords ??
        generateKeywords([fullName ?? '', nickname ?? '']),
    'hasAthleteRole': athleteFlag,
    'roles': roles,
  });
}

void main() {
  test('nome composto corta quem casa só com uma das palavras', () {
    final results = rankAthleteSearchResults(
      [
        doc('a', fullName: 'João Silva'),
        doc('b', fullName: 'Maria Silva'),
        doc('c', fullName: 'João Pedro Silva'),
      ],
      searchQueryTokens('joão silva'),
      max: 10,
    );

    expect(results.map((r) => r.uid), ['a', 'c']);
  });

  test('sem casamento completo devolve quem casou com a âncora', () {
    final results = rankAthleteSearchResults(
      [doc('a', fullName: 'Maria Souza'), doc('b', fullName: 'Ana Souza')],
      searchQueryTokens('joao souza'),
      max: 10,
    );

    expect(results.map((r) => r.uid), containsAll(['a', 'b']));
  });

  test('casamento exato vem na frente do resto', () {
    final results = rankAthleteSearchResults(
      [
        doc('meio', fullName: 'Mariana Costa', nickname: 'mari'),
        doc('exato', fullName: 'Ana Silva', nickname: 'ana'),
        doc('comeco', fullName: 'Ana Beatriz', nickname: 'aninha'),
      ],
      searchQueryTokens('ana'),
      max: 10,
    );

    expect(results.first.uid, 'exato');
    expect(results[1].uid, 'comeco');
  });

  test('perfil sem a flag entra pelo roles[] do doc', () {
    final results = rankAthleteSearchResults(
      [doc('a', fullName: 'Rafael Souza', athleteFlag: false)],
      searchQueryTokens('rafael'),
      max: 10,
    );

    expect(results.map((r) => r.uid), ['a']);
  });

  test('perfil sem papel de atleta fica de fora', () {
    final results = rankAthleteSearchResults(
      [
        doc(
          'org',
          fullName: 'Rafael Souza',
          athleteFlag: false,
          roles: const ['organizer'],
        ),
      ],
      searchQueryTokens('rafael'),
      max: 10,
    );

    expect(results, isEmpty);
  });

  test('keywords velho não esconde quem casa pelo nome', () {
    final results = rankAthleteSearchResults(
      [
        doc(
          'a',
          fullName: 'Rafael Souza',
          // Gravado por uma versão antiga do gerador: só o primeiro nome.
          keywords: const ['ra', 'raf', 'rafa', 'rafae', 'rafael'],
        ),
      ],
      searchQueryTokens('rafael souza'),
      max: 10,
    );

    expect(results.map((r) => r.uid), ['a']);
  });

  test('apelido colado acha quem tem separador', () {
    final results = rankAthleteSearchResults(
      [doc('a', fullName: 'Ana Paula', nickname: '@ana_paula')],
      searchQueryTokens('anapaula'),
      max: 10,
    );

    expect(results.map((r) => r.uid), ['a']);
  });

  test('perfil sem nome exibível não aparece', () {
    final results = rankAthleteSearchResults(
      [doc('a', keywords: const ['jo', 'joa', 'joao'])],
      searchQueryTokens('joao'),
      max: 10,
    );

    expect(results, isEmpty);
  });

  test('respeita o teto de resultados', () {
    final docs = List.generate(
      8,
      (i) => doc('u$i', fullName: 'Silva Numero $i'),
    );
    final results = rankAthleteSearchResults(
      docs,
      searchQueryTokens('silva'),
      max: 3,
    );

    expect(results.length, 3);
  });
}
