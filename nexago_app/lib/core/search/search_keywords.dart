/// Normalização de termos de busca (espelho de `functions/src/search-keywords.ts`).
///
/// O app GRAVA `keywords` no perfil (`athlete_profile_repository`), então este
/// arquivo e o canônico em `functions/` precisam gerar o MESMO conjunto — se
/// divergirem, salvar o perfil pelo app rebaixa a busca do atleta.
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

/// Mesma normalização, mas PRESERVANDO o acento (só derruba caixa e pontuação).
///
/// As variantes acentuadas entram em `keywords` como apólice: qualquer
/// superfície que consulte sem passar por [normalizeSearchTerm] ainda acha o
/// atleta. Só é emitida quando difere da forma sem acento.
String normalizeAccentedTerm(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';
  return trimmed
      .toLowerCase()
      .replaceAll(RegExp(r'[^\p{L}\p{N}]', unicode: true), '');
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

// Só os separadores que de fato quebram palavra num nome. Apóstrofo e
// parênteses ficam de FORA de propósito: `D'Ávila` tem que virar `davila`
// (a normalização os apaga e cola as partes), não `d` + `avila`.
final RegExp _tokenSeparators = RegExp(r'[\s@._-]+');

Iterable<String> _splitParts(String value) {
  return value.split(_tokenSeparators).where((p) => p.trim().isNotEmpty);
}

bool _looksLikeEmail(String raw) => raw.trim().indexOf('@') > 0;

/// Quebra texto em tokens: palavras, partes de e-mail e separadores `. _ -`.
List<String> tokenizeSearchText(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return [];

  final tokens = <String>[];
  final seen = <String>{};

  void addParts(String value) {
    for (final part in _splitParts(value)) {
      final normalized = normalizeSearchTerm(part);
      if (normalized.isEmpty || !seen.add(normalized)) continue;
      tokens.add(normalized);
    }
  }

  if (trimmed.contains('@')) {
    final atIndex = trimmed.indexOf('@');
    addParts(trimmed.substring(0, atIndex));
    addParts(trimmed.substring(atIndex + 1));
  } else {
    addParts(trimmed);
  }

  return tokens;
}

/// Tokens preservando acento, na mesma quebra de [tokenizeSearchText].
List<String> _tokenizeAccentedText(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return [];
  final atIndex = trimmed.indexOf('@');
  final source = atIndex >= 0
      ? '${trimmed.substring(0, atIndex)} ${trimmed.substring(atIndex + 1)}'
      : trimmed;

  final out = <String>[];
  final seen = <String>{};
  for (final part in _splitParts(source)) {
    final accented = normalizeAccentedTerm(part);
    if (accented.isEmpty || !seen.add(accented)) continue;
    out.add(accented);
  }
  return out;
}

/// Todas as formas indexáveis de um texto: cada palavra sem acento, cada
/// palavra com acento (quando difere) e a forma COLADA do texto inteiro — é
/// ela que faz `ana_paula` e `João Silva` casarem com quem digita `anapaula` /
/// `joaosilva`.
List<String> searchVariants(String raw) {
  final ascii = tokenizeSearchText(raw);
  if (ascii.isEmpty) return const [];

  final out = <String>[...ascii];
  final seen = <String>{...ascii};

  void push(String value) {
    if (value.isEmpty || !seen.add(value)) return;
    out.add(value);
  }

  // A forma colada é para nome/apelido. E-mail fica de fora: `maria@gmail.com`
  // viraria `mariagmailcom`, dezenas de prefixos sem valor de busca — e o
  // endereço reconstruído num espelho que é declaradamente sem PII.
  if (ascii.length > 1 && !_looksLikeEmail(raw)) push(ascii.join());
  for (final accented in _tokenizeAccentedText(raw)) {
    push(accented);
  }

  return out;
}

List<String> _wordPrefixes(String token, int minPrefix, int maxLen) {
  if (token.isEmpty) return const [];

  final limit = token.length < maxLen ? token.length : maxLen;
  final out = <String>{};
  final start = minPrefix > limit ? limit : (minPrefix < 1 ? 1 : minPrefix);
  for (var i = start; i <= limit; i++) {
    out.add(token.substring(0, i));
  }
  out.add(token);
  return out.toList();
}

/// Gera as `keywords` de busca a partir de várias fontes de texto.
///
/// Duas passadas de propósito: primeiro a forma EXATA de toda variante, depois
/// os prefixos. Assim, se o teto de [maxKeywords] estourar num nome muito
/// longo, o apelido ainda tem sua palavra inteira indexada — a passada única
/// gastava o orçamento todo nos prefixos da primeira fonte.
List<String> generateKeywords(
  List<String> sources, {
  int minPrefix = kSearchMinPrefixLength,
  int maxKeywords = kSearchMaxKeywords,
}) {
  final variants = <String>[];
  final seenVariants = <String>{};
  for (final source in sources) {
    if (source.trim().isEmpty) continue;
    for (final variant in searchVariants(source)) {
      if (seenVariants.add(variant)) variants.add(variant);
    }
  }

  final keywords = <String>{};
  for (final variant in variants) {
    if (keywords.length >= maxKeywords) break;
    keywords.add(variant);
  }
  for (final variant in variants) {
    if (keywords.length >= maxKeywords) break;
    for (final prefix in _wordPrefixes(variant, minPrefix, 32)) {
      keywords.add(prefix);
      if (keywords.length >= maxKeywords) break;
    }
  }

  return keywords.toList()..sort();
}

/// Tokens do termo digitado, na ordem em que foram escritos.
List<String> searchQueryTokens(String raw) => tokenizeSearchText(raw);

/// Token que vai no `array-contains`: o mais longo é o mais seletivo, então
/// `de oliveira` consulta por `oliveira` e não pela preposição. Os demais
/// tokens viram filtro no client ([profileMatchesSearchTokens]).
String searchAnchorToken(List<String> tokens) {
  var anchor = '';
  for (final token in tokens) {
    if (token.length > anchor.length) anchor = token;
  }
  return anchor;
}

/// Texto de um perfil que o filtro de busca enxerga.
class SearchableProfileText {
  const SearchableProfileText({
    this.fullName,
    this.nickname,
    this.keywords = const [],
  });

  final String? fullName;
  final String? nickname;
  final List<String> keywords;

  List<String> get _texts {
    final out = <String>[];
    final name = fullName?.trim();
    if (name != null && name.isNotEmpty) out.add(name);
    final nick = normalizeNicknameForSearch(nickname ?? '');
    if (nick.isNotEmpty) out.add(nick);
    return out;
  }

  List<String> get variants =>
      _texts.expand(searchVariants).toList(growable: false);

  List<String> get words =>
      _texts.expand(tokenizeSearchText).toList(growable: false);
}

/// O documento casa com TODOS os tokens digitados? É o `AND` que o Firestore
/// não faz: `array-contains` aceita um valor só, então a consulta ancora no
/// token mais seletivo e este filtro corta o resto — sem leitura extra, porque
/// `keywords` e o nome já vieram no próprio doc.
bool profileMatchesSearchTokens(
  SearchableProfileText profile,
  List<String> tokens,
) {
  if (tokens.isEmpty) return false;
  final variants = profile.variants;
  return tokens.every((token) {
    if (profile.keywords.contains(token)) return true;
    // Confere também contra o nome do próprio doc: `keywords` gravado por uma
    // versão antiga do gerador não pode esconder um atleta que casa de fato.
    return variants.any((variant) => variant.startsWith(token));
  });
}

/// Ordem de exibição do resultado: quanto menor, mais relevante. Sem isso o
/// `limit` do Firestore devolve um recorte arbitrário e o casamento exato pode
/// ficar de fora da página.
int searchRelevanceScore(
  SearchableProfileText profile,
  List<String> tokens,
) {
  if (tokens.isEmpty) return 9;
  final joined = tokens.join();
  final nickname = normalizeSearchTerm(
    normalizeNicknameForSearch(profile.nickname ?? ''),
  );
  final fullName = normalizeSearchTerm(profile.fullName?.trim() ?? '');
  final words = profile.words;

  if (nickname == joined || fullName == joined) return 0;
  if (words.contains(joined)) return 1;
  if (nickname.startsWith(joined) || fullName.startsWith(joined)) return 2;
  if (words.any((word) => word.startsWith(tokens.first))) return 3;
  return 4;
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
  return roles is List &&
      roles.any((r) => r is String && r.trim().toLowerCase() == role);
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
  const accents = 'àáâãäåèéêëìíîïòóôõöùúûüçñýÿ';
  const plain = 'aaaaaaeeeeiiiiooooouuuucnyy';
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

/// Prefixos para busca case-insensitive de `nickname` no Firestore.
List<String> nicknameSearchPrefixes(String raw) {
  final v = raw.trim();
  if (v.isEmpty) return const [];
  if (v.length == 1) {
    return [v, v.toLowerCase(), v.toUpperCase()];
  }
  final lower = v.toLowerCase();
  final title = '${v[0].toUpperCase()}${v.substring(1).toLowerCase()}';
  return {v, lower, v.toUpperCase(), title}.toList();
}
