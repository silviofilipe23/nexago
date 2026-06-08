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
}
