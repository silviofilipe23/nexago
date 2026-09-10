import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/search/search_keywords.dart';
import 'package:nexago_app/features/athlete/domain/athlete_discover_search.dart';

Map<String, dynamic> _doc({
  required String fullName,
  String? nickname,
  bool athlete = true,
  bool publicProfile = true,
}) {
  return {
    'fullName': fullName,
    if (nickname != null) 'nickname': nickname,
    'hasAthleteRole': athlete,
    'keywords': generateKeywords([fullName, nickname ?? '']),
    'publicProfileEnabled': publicProfile,
  };
}

void main() {
  test('nome composto casa — o bug do token único', () {
    final docs = {
      'a': _doc(fullName: 'João Silva'),
      'b': _doc(fullName: 'João Pereira'),
    };

    final result = rankDiscoverSearchProfiles(
      docs,
      searchQueryTokens('joão silva'),
    );

    expect(result.map((p) => p.id), ['a']);
  });

  test('apelido colado encontra apelido com separador', () {
    final docs = {'a': _doc(fullName: 'Ana Paula', nickname: 'ana_paula')};

    final result = rankDiscoverSearchProfiles(
      docs,
      searchQueryTokens('anapaula'),
    );

    expect(result.map((p) => p.id), ['a']);
  });

  test('termo sem acento encontra nome acentuado', () {
    final docs = {'a': _doc(fullName: 'João Gonçalves')};

    final result = rankDiscoverSearchProfiles(
      docs,
      searchQueryTokens('joao goncalves'),
    );

    expect(result.map((p) => p.id), ['a']);
  });

  test('perfil não discoverable fica de fora', () {
    final docs = {
      'a': _doc(fullName: 'João Silva'),
      'b': _doc(fullName: 'João Silva', publicProfile: false),
    };

    final result = rankDiscoverSearchProfiles(
      docs,
      searchQueryTokens('joão silva'),
    );

    expect(result.map((p) => p.id), ['a']);
  });

  test('respeita o teto de resultados', () {
    final docs = {
      for (var i = 0; i < 30; i++) 'u$i': _doc(fullName: 'João Silva $i'),
    };

    final result = rankDiscoverSearchProfiles(
      docs,
      searchQueryTokens('joão'),
      max: 5,
    );

    expect(result.length, 5);
  });
}
