/// Normalização de termos de busca (espelho de `functions/src/search-keywords.ts`).
library;

const int kSearchMinPrefixLength = 2;
const int kSearchMaxKeywords = 400;

String normalizeSearchTerm(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';
  return _stripDiacritics(trimmed)
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]'), '');
}

bool isSearchTermLongEnough(String raw) {
  return normalizeSearchTerm(raw).length >= kSearchMinPrefixLength;
}

/// Remove `@` inicial de apelidos antes de tokenizar.
String normalizeNicknameForSearch(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';
  return trimmed.startsWith('@') ? trimmed.substring(1).trim() : trimmed;
}

/// Quebra texto em tokens: palavras, partes de e-mail e separadores `. _ -`.
List<String> tokenizeSearchText(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return [];

  final tokens = <String>{};

  void addParts(String value) {
    for (final part in value.split(RegExp(r'[\s@._-]+'))) {
      final normalized = normalizeSearchTerm(part);
      if (normalized.isNotEmpty) tokens.add(normalized);
    }
  }

  if (trimmed.contains('@')) {
    final atIndex = trimmed.indexOf('@');
    addParts(trimmed.substring(0, atIndex));
    addParts(trimmed.substring(atIndex + 1));
  } else {
    addParts(trimmed);
  }

  return tokens.toList();
}

List<String> _wordPrefixes(String token, int minPrefix, int maxLen) {
  final normalized = normalizeSearchTerm(token);
  if (normalized.isEmpty) return [];

  final limit = normalized.length < maxLen ? normalized.length : maxLen;
  final out = <String>{};
  final start = minPrefix > limit ? limit : (minPrefix < 1 ? 1 : minPrefix);
  for (var i = start; i <= limit; i++) {
    out.add(normalized.substring(0, i));
  }
  out.add(normalized);
  return out.toList();
}

/// Gera prefixos por palavra a partir de várias fontes de texto.
List<String> generateKeywords(
  List<String> sources, {
  int minPrefix = kSearchMinPrefixLength,
  int maxKeywords = kSearchMaxKeywords,
}) {
  final keywords = <String>{};

  for (final source in sources) {
    if (source.trim().isEmpty) continue;
    for (final token in tokenizeSearchText(source)) {
      for (final prefix in _wordPrefixes(token, minPrefix, 32)) {
        keywords.add(prefix);
        if (keywords.length >= maxKeywords) {
          return keywords.toList()..sort();
        }
      }
    }
  }

  return keywords.toList()..sort();
}

class UserSearchFields {
  const UserSearchFields({
    required this.keywords,
    required this.hasAthleteRole,
    required this.hasOrganizerRole,
  });

  final List<String> keywords;
  final bool hasAthleteRole;
  final bool hasOrganizerRole;
}

bool _userDocHasRole(Map<String, dynamic> data, String role) {
  final roles = data['roles'];
  if (roles is List && roles.isNotEmpty) {
    return roles.any(
      (r) => r is String && r.trim().toLowerCase() == role,
    );
  }
  final legacy = data['role'];
  return legacy is String && legacy.trim().toLowerCase() == role;
}

String _readString(Map<String, dynamic> data, String key) {
  final v = data[key];
  return v is String ? v.trim() : '';
}

/// Monta `keywords` e flags de papel a partir de um mapa de usuário Firestore.
UserSearchFields buildUserSearchFields(Map<String, dynamic> data) {
  final fullName = _readString(data, 'fullName').isNotEmpty
      ? _readString(data, 'fullName')
      : _readString(data, 'name');
  final nickname = normalizeNicknameForSearch(_readString(data, 'nickname'));
  final email = _readString(data, 'email');

  return UserSearchFields(
    keywords: generateKeywords([fullName, nickname, email]),
    hasAthleteRole: _userDocHasRole(data, 'athlete'),
    hasOrganizerRole: _userDocHasRole(data, 'organizer'),
  );
}

String _stripDiacritics(String value) {
  const accents = 'àáâãäåèéêëìíîïòóôõöùúûüçñ';
  const plain = 'aaaaaaeeeeiiiiooooouuuucn';
  final buffer = StringBuffer();
  for (final rune in value.runes) {
    final char = String.fromCharCode(rune);
    final lower = char.toLowerCase();
    final idx = accents.indexOf(lower);
    if (idx >= 0) {
      buffer.write(plain[idx]);
    } else {
      buffer.write(char);
    }
  }
  return buffer.toString();
}
