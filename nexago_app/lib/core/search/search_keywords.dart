/// Normalização de termos de busca (espelho de `functions/src/search-keywords.ts`).
library;

const int kSearchMinPrefixLength = 2;

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
