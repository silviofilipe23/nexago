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

  test('buildUserSearchFields uses legacy role when roles empty', () {
    final fields = buildUserSearchFields({
      'fullName': 'Ana',
      'role': 'athlete',
    });

    expect(fields.hasAthleteRole, isTrue);
    expect(fields.hasOrganizerRole, isFalse);
    expect(fields.keywords, contains('an'));
  });
}
