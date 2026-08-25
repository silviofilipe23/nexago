import 'package:characters/characters.dart';

/// Troca surrogates UTF-16 órfãos por U+FFFD.
///
/// `Text`/`TextSpan` crasham com `string is not well-formed UTF-16` quando o
/// dado do Firestore (ou um `substring` no meio de um emoji) deixa um par
/// incompleto.
String sanitizeUtf16(String input) {
  if (input.isEmpty) return input;
  final units = input.codeUnits;
  final out = StringBuffer();
  for (var i = 0; i < units.length; i++) {
    final u = units[i];
    if (u >= 0xD800 && u <= 0xDBFF) {
      if (i + 1 < units.length) {
        final next = units[i + 1];
        if (next >= 0xDC00 && next <= 0xDFFF) {
          out.writeCharCode(u);
          out.writeCharCode(next);
          i++;
          continue;
        }
      }
      out.writeCharCode(0xFFFD);
      continue;
    }
    if (u >= 0xDC00 && u <= 0xDFFF) {
      out.writeCharCode(0xFFFD);
      continue;
    }
    out.writeCharCode(u);
  }
  return out.toString();
}

/// Primeiros [count] grafemas (emojis contam como 1), em maiúsculas.
String firstGraphemesUpper(String input, int count) {
  final chars = sanitizeUtf16(input).characters;
  if (chars.isEmpty || count <= 0) return '?';
  return chars.take(count).toString().toUpperCase();
}

/// "Pereira 🐸" → "Pereira 🐸." / "Ana Silva" → "Ana S."
///
/// Nunca usa `string[0]`/`substring` — isso parte emoji em UTF-16 inválido.
String shortPersonLabel(String fullName, {String fallback = 'Atleta'}) {
  final parts = sanitizeUtf16(fullName)
      .trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.isEmpty) return fallback;
  if (parts.length == 1) return parts.first;
  return '${parts.first} ${firstGraphemesUpper(parts.last, 1)}.';
}
