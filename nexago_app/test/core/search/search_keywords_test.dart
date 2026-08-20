import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/search/search_keywords.dart';

void main() {
  test('normalizeSearchTerm strips accents and non-alphanumeric', () {
    expect(normalizeSearchTerm('  Silvio  '), 'silvio');
    expect(normalizeSearchTerm('Goiânia'), 'goiania');
    expect(normalizeSearchTerm(''), '');
  });

  test('isSearchTermLongEnough requires min prefix length', () {
    expect(isSearchTermLongEnough('s'), isFalse);
    expect(isSearchTermLongEnough('si'), isTrue);
    expect(isSearchTermLongEnough('dion'), isTrue);
  });

  test('normalizeNicknameForSearch strips leading @', () {
    expect(normalizeNicknameForSearch('@silvio'), 'silvio');
    expect(normalizeNicknameForSearch('  @marina  '), 'marina');
    expect(normalizeNicknameForSearch('rafa'), 'rafa');
  });

  test('tokenizeSearchText splits email local and domain parts', () {
    final tokens = tokenizeSearchText('liga3@aaa.com');
    expect(tokens, contains('liga3'));
    expect(tokens, contains('aaa'));
    expect(tokens, contains('com'));
  });

  test('generateKeywords produces per-word prefixes for full name', () {
    final keywords = generateKeywords(['Silvio Dionizio'], minPrefix: 1);
    expect(keywords, contains('silvio'));
    expect(keywords, contains('dionizio'));
    expect(keywords, contains('dion'));
  });

  test('generateKeywords defaults minPrefix to 2', () {
    final keywords = generateKeywords(['Silvio Dionizio']);
    expect(keywords, isNot(contains('s')));
    expect(keywords, contains('si'));
    expect(keywords, contains('di'));
    expect(keywords, contains('dion'));
  });

  test('buildUserSearchFields includes name nickname and email', () {
    final fields = buildUserSearchFields({
      'fullName': 'Silvio Dionizio',
      'nickname': '@silvio',
      'email': 'liga3@aaa.com',
      'roles': ['athlete'],
    });

    expect(fields.hasAthleteRole, isTrue);
    expect(fields.hasOrganizerRole, isFalse);
    expect(fields.keywords, contains('silvio'));
    expect(fields.keywords, contains('dion'));
    expect(fields.keywords, contains('liga3'));
  });

  test('buildUserSearchFields ignores legacy role field when roles is absent', () {
    final fields = buildUserSearchFields({
      'fullName': 'Ana',
      'role': 'athlete',
    });

    expect(fields.hasAthleteRole, isFalse);
    expect(fields.hasOrganizerRole, isFalse);
    expect(fields.keywords, contains('an'));
  });

  group('variantes acentuadas e forma colada', () {
    test('guarda a variante COM acento ao lado da sem acento', () {
      final keywords = generateKeywords(['João Gonçalves']);
      expect(keywords, contains('joao'));
      expect(keywords, contains('joão'));
      expect(keywords, contains('goncalves'));
      expect(keywords, contains('gonçalves'));
      expect(keywords, contains('gonç'));
    });

    test('palavra sem acento não duplica keyword', () {
      final keywords = generateKeywords(['Silva']);
      expect(keywords.where((k) => k == 'silva').length, 1);
    });

    test("apostrofo cola as partes: D'Avila vira davila", () {
      final keywords = generateKeywords(['Maria D\u2019\u00c1vila']);
      expect(keywords, contains('davila'));
      expect(keywords, isNot(contains('avila')));
    });

    test('guarda a forma colada do nome inteiro', () {
      final keywords = generateKeywords(['João Silva']);
      expect(keywords, contains('joaosilva'));
      expect(keywords, contains('joaos'));
    });

    test('apelido com separador casa colado e por parte', () {
      final fields = buildUserSearchFields({
        'fullName': 'Ana Paula',
        'nickname': '@ana_paula',
        'roles': ['athlete'],
      });
      expect(fields.keywords, contains('anapaula'));
      expect(fields.keywords, contains('ana'));
      expect(fields.keywords, contains('paula'));
    });

    test('e-mail nao gera forma colada (nao reconstroi o endereco)', () {
      final keywords = generateKeywords(['maria.ap@gmail.com']);
      expect(keywords, contains('maria'));
      expect(keywords, contains('gmail'));
      expect(keywords, isNot(contains('mariaapgmailcom')));
    });

    test('todo token tem a forma exata mesmo com o teto estourado', () {
      final keywords = generateKeywords(
        ['Ana Beatriz Carolina Daniela', 'apelidozz'],
        maxKeywords: 12,
      );
      expect(keywords.length, 12);
      expect(keywords, contains('apelidozz'));
      expect(keywords, contains('ana'));
    });
  });

  group('lado da consulta', () {
    test('searchQueryTokens quebra o termo em palavras normalizadas', () {
      expect(searchQueryTokens('  João   Silva '), ['joao', 'silva']);
      expect(searchQueryTokens('@ana_paula'), ['ana', 'paula']);
      expect(searchQueryTokens('   '), isEmpty);
    });

    test('searchAnchorToken escolhe o token mais longo', () {
      expect(searchAnchorToken(['de', 'oliveira']), 'oliveira');
      expect(searchAnchorToken(const []), '');
    });

    test('profileMatchesSearchTokens exige TODOS os tokens', () {
      const profile = SearchableProfileText(
        fullName: 'João Pedro Silva',
        nickname: 'jp',
      );
      expect(profileMatchesSearchTokens(profile, ['joao', 'silva']), isTrue);
      expect(profileMatchesSearchTokens(profile, ['joao', 'souza']), isFalse);
      expect(profileMatchesSearchTokens(profile, ['joaopedro']), isTrue);
    });

    test('profileMatchesSearchTokens casa por keywords quando o nome falta', () {
      const profile = SearchableProfileText(keywords: ['ra', 'raf', 'rafa']);
      expect(profileMatchesSearchTokens(profile, ['rafa']), isTrue);
      expect(profileMatchesSearchTokens(profile, ['rafael']), isFalse);
    });

    test('profileMatchesSearchTokens casa pelo nome quando keywords esta velho', () {
      const profile = SearchableProfileText(
        fullName: 'Rafael Souza',
        keywords: ['ra', 'raf'],
      );
      expect(profileMatchesSearchTokens(profile, ['souza']), isTrue);
    });

    test('searchRelevanceScore poe o casamento exato na frente', () {
      const exato = SearchableProfileText(fullName: 'Ana Silva', nickname: 'ana');
      const comeco = SearchableProfileText(fullName: 'Ana Beatriz', nickname: 'aninha');
      const meio = SearchableProfileText(fullName: 'Mariana Costa', nickname: 'mari');
      final tokens = ['ana'];
      expect(
        searchRelevanceScore(exato, tokens),
        lessThan(searchRelevanceScore(comeco, tokens)),
      );
      expect(
        searchRelevanceScore(comeco, tokens),
        lessThan(searchRelevanceScore(meio, tokens)),
      );
    });
  });
}
