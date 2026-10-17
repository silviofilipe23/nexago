/// Loja · Personalizar (app 02b nome / 02c imagem): nome, preço, cor
/// padrão, qualidade e validação da imagem, geometria da prévia e o ajuste
/// fino da imagem — puras, testáveis sem Firebase.
///
/// A fonte de verdade é `docs/business-rules/loja-personalizar.md`,
/// compartilhada com o portal web e com a callable
/// `addStoreCustomItemToCart` (`functions/src/store-custom-cart.ts`), que
/// revalida tudo: mudar uma regra aqui é mudar lá também.
library;

import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'store_models.dart';
import 'store_product_rules.dart';

// ── Nome ────────────────────────────────────────────────────────────────

/// Letras (com acento), números, espaço, ponto e hífen — depois de ir para
/// maiúsculas. O mesmo `NAME_RE` do servidor.
final RegExp _allowedNameChar = RegExp(r'^[\p{Lu}0-9 .\-]$', unicode: true);
final RegExp _whitespace = RegExp(r'\s');
final RegExp _spaces = RegExp(r'\s+');

/// O que o servidor grava (`normalizeCustomName`): maiúsculas, um espaço só
/// entre as palavras e nenhum nas pontas.
String normalizeStoreCustomName(String text) =>
    text.toUpperCase().replaceAll(_spaces, ' ').trim();

/// Tamanho do nome como o servidor conta (pontos de código).
int storeCustomNameLength(String text) => text.runes.length;

/// O campo depois de uma tecla.
class StoreNameInput {
  const StoreNameInput(this.text, {this.rejected = false});

  final String text;

  /// Algum caractere não entrou (o campo treme e o hint fica vermelho).
  final bool rejected;
}

/// Ao digitar: maiúsculas; só letras (com acento), números, espaço, ponto e
/// hífen; sem espaço no começo nem duplo; até [maxChars]. Um espaço no FIM
/// fica — é o atleta indo para a próxima palavra; [normalizeStoreCustomName]
/// tira na hora de usar.
StoreNameInput formatStoreCustomNameInput(String raw, int maxChars) {
  final out = StringBuffer();
  var rejected = false;
  var count = 0;
  // Começa como "depois de um espaço": descarta os espaços do começo.
  var afterSpace = true;
  for (final rune in raw.toUpperCase().runes) {
    var ch = String.fromCharCode(rune);
    if (_whitespace.hasMatch(ch)) ch = ' ';
    if (!_allowedNameChar.hasMatch(ch)) {
      rejected = true;
      continue;
    }
    final space = ch == ' ';
    if (space && afterSpace) continue;
    if (count >= maxChars) break;
    afterSpace = space;
    out.write(ch);
    count++;
  }
  return StoreNameInput(out.toString(), rejected: rejected);
}

/// O hint fica laranja a partir de `max − 2`.
bool storeCustomNameNearLimit(int length, int maxChars) =>
    length >= maxChars - 2;

/// O que `checkStoreCustomName` devolve quando o nome não passa.
enum StoreNameProblem {
  empty,
  chars,
  length,
  blocked,
  disabled;

  /// Texto desconhecido vira `null` (o servidor revalida no "Adicionar").
  static StoreNameProblem? from(Object? raw) {
    for (final problem in values) {
      if (problem.name == raw) return problem;
    }
    return null;
  }
}

/// "Nome nas costas" / "Nome na frente" / "Nome na manga".
String storeNameStepTitle(StoreNamePlacement placement) {
  switch (placement) {
    case StoreNamePlacement.backUpper:
    case StoreNamePlacement.backLower:
      return 'Nome nas costas';
    case StoreNamePlacement.front:
      return 'Nome na frente';
    case StoreNamePlacement.sleeve:
      return 'Nome na manga';
  }
}

/// Lado da prévia em que o nome aparece (a manga fica na frente).
StorePhotoView storeNameSide(StoreNamePlacement placement) {
  switch (placement) {
    case StoreNamePlacement.backUpper:
    case StoreNamePlacement.backLower:
      return StorePhotoView.back;
    case StoreNamePlacement.front:
    case StoreNamePlacement.sleeve:
      return StorePhotoView.front;
  }
}

// ── Preço ───────────────────────────────────────────────────────────────

/// `nome && imagem ? bothCents : nome ? nameOnlyCents : imagem ?
/// imageOnlyCents : 0` — a mesma conta de `customExtraCents` do servidor.
int storeCustomExtraCents(
  StoreCustomPrice price, {
  required bool hasName,
  required bool hasImage,
}) {
  if (hasName && hasImage) return price.bothCents;
  if (hasName) return price.nameOnlyCents;
  if (hasImage) return price.imageOnlyCents;
  return 0;
}

/// Preço do SKU escolhido + adicional, por [qty] unidades.
int storeCustomTotalCents({
  required int skuPriceCents,
  required int extraCents,
  int qty = 1,
}) =>
    (skuPriceCents + extraCents) * (qty < 1 ? 1 : qty);

// ── Cor do nome ─────────────────────────────────────────────────────────

/// `#rrggbb` (ou `rrggbb`) → canais 0–255; qualquer outra coisa, `null`.
List<int>? _rgb(String? hex) {
  if (hex == null) return null;
  final clean = hex.trim().replaceFirst('#', '');
  if (clean.length != 6) return null;
  final value = int.tryParse(clean, radix: 16);
  if (value == null) return null;
  return [(value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF];
}

/// Luminância relativa do WCAG 2.x.
double? storeRelativeLuminance(String? hex) {
  final rgb = _rgb(hex);
  if (rgb == null) return null;
  double channel(int c) {
    final s = c / 255;
    return s <= 0.03928
        ? s / 12.92
        : math.pow((s + 0.055) / 1.055, 2.4).toDouble();
  }

  return 0.2126 * channel(rgb[0]) +
      0.7152 * channel(rgb[1]) +
      0.0722 * channel(rgb[2]);
}

/// Razão de contraste do WCAG (1 a 21); cor ilegível conta como 1.
double storeContrastRatio(String a, String b) {
  final la = storeRelativeLuminance(a);
  final lb = storeRelativeLuminance(b);
  if (la == null || lb == null) return 1;
  final hi = math.max(la, lb);
  final lo = math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/// Cor padrão do nome: a de MAIOR contraste com a cor do SKU ([skuHex]);
/// empate fica com a primeira. SKU sem cor conhecida → a 1ª da config.
/// `null` = config sem cor.
String? storeDefaultNameColor(List<String> colors, String? skuHex) {
  if (colors.isEmpty) return null;
  if (_rgb(skuHex) == null) return colors.first;
  var best = colors.first;
  var bestRatio = storeContrastRatio(best, skuHex!);
  for (final color in colors.skip(1)) {
    final ratio = storeContrastRatio(color, skuHex);
    if (ratio > bestRatio) {
      best = color;
      bestRatio = ratio;
    }
  }
  return best;
}

/// Fundo do mockup listrado sem cor de peça conhecida.
const String kStoreMockupBaseHex = '#0f1214';

/// Peça clara: o texto por cima fica escuro (contraste com o preto maior
/// que com o branco). Sem cor conhecida, `false` (o mockup padrão é escuro).
bool storePrefersDarkText(String? hex) {
  if (_rgb(hex) == null) return false;
  return storeContrastRatio(hex!, '#000000') >
      storeContrastRatio(hex, '#ffffff');
}

/// `hex` do valor de cor escolhido (o 1º eixo de cor); `null` sem cor.
String? storeSelectedColorHex(StoreProduct p, Map<String, String> selected) {
  for (final axis in p.axes) {
    if (!isStoreColorAxis(axis)) continue;
    final id = selected[axis.id];
    for (final v in axis.values) {
      if (v.id == id) return v.hex;
    }
    return null;
  }
  return null;
}

// ── Imagem: formato, medida e validação ─────────────────────────────────

/// dpi efetivo a partir do qual a imagem é "boa qualidade" (`GOOD_DPI`).
const double kStoreGoodDpi = 300;

enum StoreImageQuality {
  good,
  warn;

  /// O valor que a callable devolve (`good`/`warn`).
  static StoreImageQuality? from(Object? raw) {
    for (final q in values) {
      if (q.name == raw) return q;
    }
    return null;
  }
}

/// dpi efetivo = px ÷ (cm ÷ 2,54), no lado mais fraco. Sem medida (SVG) não
/// tem limite.
double storeEffectiveDpi({
  required int? widthPx,
  required int? heightPx,
  required StoreCustomArea area,
}) {
  if (widthPx == null || heightPx == null) return double.infinity;
  return math.min(
    widthPx / (area.widthCm / 2.54),
    heightPx / (area.heightCm / 2.54),
  );
}

StoreImageQuality storeImageQuality(double dpi) =>
    dpi >= kStoreGoodDpi ? StoreImageQuality.good : StoreImageQuality.warn;

bool _startsWith(Uint8List bytes, List<int> magic) {
  if (bytes.length < magic.length) return false;
  for (var i = 0; i < magic.length; i++) {
    if (bytes[i] != magic[i]) return false;
  }
  return true;
}

/// `png`, `jpg` ou `svg` pelos primeiros bytes; sem assinatura conhecida,
/// pela extensão de [fileName]. `null` = formato que a Loja não aceita.
String? storeImageFormat(Uint8List bytes, {String fileName = ''}) {
  if (_startsWith(bytes, const [0x89, 0x50, 0x4E, 0x47])) return 'png';
  if (_startsWith(bytes, const [0xFF, 0xD8])) return 'jpg';
  final head = utf8.decode(
    bytes.length > 4096 ? bytes.sublist(0, 4096) : bytes,
    allowMalformed: true,
  );
  if (RegExp(r'<svg\b', caseSensitive: false).hasMatch(head)) return 'svg';
  final dot = fileName.lastIndexOf('.');
  final ext = dot < 0 ? '' : fileName.substring(dot + 1).toLowerCase();
  return switch (ext) {
    'png' => 'png',
    'jpg' || 'jpeg' => 'jpg',
    'svg' => 'svg',
    _ => null,
  };
}

/// `contentType` que a rule do Storage aceita para cada formato.
String storeImageContentType(String format) => switch (format) {
      'png' => 'image/png',
      'svg' => 'image/svg+xml',
      _ => 'image/jpeg',
    };

/// Largura × altura lidas do começo do arquivo — PNG (IHDR), JPEG (marcador
/// SOF) e SVG (`width`/`height` ou `viewBox`). Porte de `imageSizeFromBytes`
/// do servidor: o cliente mede igual a quem confere. `null` = não deu.
({int width, int height})? storeImageSizeFromBytes(Uint8List bytes) {
  final data = ByteData.sublistView(bytes);
  if (bytes.length >= 24 &&
      _startsWith(bytes, const [0x89, 0x50, 0x4E, 0x47]) &&
      ascii.decode(bytes.sublist(12, 16), allowInvalid: true) == 'IHDR') {
    return (width: data.getUint32(16), height: data.getUint32(20));
  }
  if (bytes.length >= 4 && bytes[0] == 0xFF && bytes[1] == 0xD8) {
    var i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] != 0xFF) {
        i++;
        continue;
      }
      final marker = bytes[i + 1];
      // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC).
      if (marker >= 0xC0 &&
          marker <= 0xCF &&
          marker != 0xC4 &&
          marker != 0xC8 &&
          marker != 0xCC) {
        return (width: data.getUint16(i + 7), height: data.getUint16(i + 5));
      }
      if (marker == 0xD8 ||
          marker == 0x01 ||
          (marker >= 0xD0 && marker <= 0xD7)) {
        i += 2;
        continue;
      }
      i += 2 + data.getUint16(i + 2);
    }
    return null;
  }
  final head = utf8.decode(
    bytes.length > 65536 ? bytes.sublist(0, 65536) : bytes,
    allowMalformed: true,
  );
  final svg = RegExp(r'<svg\b[^>]*>', caseSensitive: false).firstMatch(head);
  if (svg == null) return null;
  final tag = svg.group(0)!;
  double attr(String name) {
    final m = RegExp(
      '\\b$name\\s*=\\s*["\']\\s*([0-9.]+)',
      caseSensitive: false,
    ).firstMatch(tag);
    return m == null ? double.nan : double.tryParse(m.group(1)!) ?? double.nan;
  }

  var w = attr('width');
  var h = attr('height');
  if (!(w > 0 && h > 0)) {
    final vb = RegExp(
      r'\bviewBox\s*=\s*["'
      "'"
      r']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)',
      caseSensitive: false,
    ).firstMatch(tag);
    w = vb == null ? double.nan : double.tryParse(vb.group(1)!) ?? double.nan;
    h = vb == null ? double.nan : double.tryParse(vb.group(2)!) ?? double.nan;
  }
  return w > 0 && h > 0 ? (width: w.round(), height: h.round()) : null;
}

/// Por que a imagem não sobe (conferido antes do upload).
enum StoreImageProblem { format, size, unreadable, resolution }

/// Formato em `formats`, peso ≤ `maxSizeMb`, resolução ≥ mínimo (SVG não tem
/// mínimo). `null` = pode subir.
StoreImageProblem? storeCustomImageProblem({
  required StoreCustomImageOptions options,
  required String? format,
  required int sizeBytes,
  int? widthPx,
  int? heightPx,
}) {
  if (format == null || !options.formats.contains(format)) {
    return StoreImageProblem.format;
  }
  if (sizeBytes > options.maxSizeMb * 1024 * 1024) {
    return StoreImageProblem.size;
  }
  if (format == 'svg') return null;
  if (widthPx == null || heightPx == null) return StoreImageProblem.unreadable;
  if (widthPx < options.minWidthPx || heightPx < options.minHeightPx) {
    return StoreImageProblem.resolution;
  }
  return null;
}

/// "PNG, JPG ou SVG".
String storeImageFormatsLabel(List<String> formats) {
  final labels = [for (final f in formats) f.toUpperCase()];
  if (labels.length <= 1) return labels.join();
  return '${labels.sublist(0, labels.length - 1).join(', ')} ou '
      '${labels.last}';
}

/// A regra que reprovou, no card vermelho.
String storeImageProblemMessage(
  StoreImageProblem problem,
  StoreCustomImageOptions options,
) {
  switch (problem) {
    case StoreImageProblem.format:
      return 'Formato não aceito · use '
          '${storeImageFormatsLabel(options.formats)}';
    case StoreImageProblem.size:
      return 'Arquivo maior que ${options.maxSizeMb} MB';
    case StoreImageProblem.unreadable:
      return 'Não deu pra ler essa imagem · tente outro arquivo';
    case StoreImageProblem.resolution:
      return 'Imagem pequena demais · mínimo ${options.minWidthPx} × '
          '${options.minHeightPx} px';
  }
}

/// Compressão leve de imagem acima do peso: o lado maior vai até [maxSide]
/// px, sem nunca descer abaixo do mínimo da config. `null` = reduzir não
/// adianta (já está no mínimo ou abaixo de [maxSide]).
({int width, int height})? storeCustomResizeTarget({
  required int width,
  required int height,
  required int minWidthPx,
  required int minHeightPx,
  int maxSide = 3000,
}) {
  if (width <= 0 || height <= 0) return null;
  var scale = maxSide / math.max(width, height);
  scale = math.max(scale, minWidthPx / width);
  scale = math.max(scale, minHeightPx / height);
  if (scale >= 1) return null;
  return (
    width: math.max((width * scale).round(), minWidthPx),
    height: math.max((height * scale).round(), minHeightPx),
  );
}

// ── Prévia ──────────────────────────────────────────────────────────────

/// Ponto da prévia em frações do quadro (0–1).
typedef StorePreviewPoint = ({double x, double y});

/// Peça de referência: 60 × 70 cm.
const double kStoreGarmentWidthCm = 60;
const double kStoreGarmentHeightCm = 70;

/// Faixa do nome em fração da largura do quadro: 60% (a manga é estreita:
/// 18%, como no portal).
double storeNameBandWidth(StoreNamePlacement placement) =>
    placement == StoreNamePlacement.sleeve ? 0.18 : 0.6;

/// Altura da faixa do nome em fração da altura do quadro.
const double kStoreNameBandHeight = 0.15;

/// Centro da área. `peito_esquerdo` é o esquerdo de quem veste (direita de
/// quem olha).
StorePreviewPoint storeCustomAreaCenter(String areaId) => switch (areaId) {
      'peito_esquerdo' => (x: 0.68, y: 0.30),
      'centro_frente' => (x: 0.50, y: 0.45),
      'manga' => (x: 0.88, y: 0.24),
      _ => (x: 0.50, y: 0.40),
    };

/// Caixa da área = `widthCm/60` × `heightCm/70` do quadro.
({double width, double height}) storeCustomAreaBox(StoreCustomArea area) => (
      width: math.min(1, area.widthCm / kStoreGarmentWidthCm),
      height: math.min(1, area.heightCm / kStoreGarmentHeightCm),
    );

StorePreviewPoint storeNameCenter(StoreNamePlacement placement) {
  switch (placement) {
    case StoreNamePlacement.backUpper:
      return (x: 0.50, y: 0.24);
    case StoreNamePlacement.backLower:
      return (x: 0.50, y: 0.62);
    case StoreNamePlacement.front:
      return (x: 0.50, y: 0.30);
    case StoreNamePlacement.sleeve:
      return (x: 0.88, y: 0.24);
  }
}

/// Foto do lado na cor escolhida; senão a do lado sem cor; `null` = fundo
/// listrado "MOCKUP · FRENTE/COSTAS" (foto de outra cor enganaria).
StorePhoto? storeCustomPreviewPhoto(
  StoreProduct p,
  Map<String, String> selected,
  StorePhotoView side,
) {
  final ofSide = p.photos.where((ph) => ph.view == side).toList();
  final color = p.axes.isEmpty ? null : selected[p.axes.first.id];
  if (color != null) {
    for (final ph in ofSide) {
      if (ph.colorValueId == color) return ph;
    }
  }
  for (final ph in ofSide) {
    if (ph.colorValueId == null) return ph;
  }
  return null;
}

/// Título do passo da imagem pela área: só a manga sai da frente.
String storeImageStepTitle(StoreCustomArea? area) =>
    area?.id == 'manga' ? 'Imagem na manga' : 'Imagem na frente';

/// "Camiseta Dry UV50 · Preta M" — o produto e os valores escolhidos.
String storeCustomizeSubtitle(StoreProduct p, Map<String, String> selected) {
  final values = [
    for (final axis in p.axes) storeSelectedValueLabel(axis, selected),
  ].where((label) => label.isNotEmpty).join(' ');
  return values.isEmpty ? p.name : '${p.name} · $values';
}

// ── Ajuste fino da imagem ───────────────────────────────────────────────

/// Posição da imagem relativa à área: `x, y` = centro (0–1); `scale` =
/// largura da imagem ÷ largura da área (0,1–1).
class StoreImageTransform {
  const StoreImageTransform({
    required this.x,
    required this.y,
    required this.scale,
  });

  final double x;
  final double y;
  final double scale;

  Map<String, double> toMap() => {'x': x, 'y': y, 'scale': scale};

  StoreImageTransform copyWith({double? x, double? y, double? scale}) =>
      StoreImageTransform(
        x: x ?? this.x,
        y: y ?? this.y,
        scale: scale ?? this.scale,
      );

  @override
  bool operator ==(Object other) =>
      other is StoreImageTransform &&
      other.x == x &&
      other.y == y &&
      other.scale == scale;

  @override
  int get hashCode => Object.hash(x, y, scale);

  @override
  String toString() => 'StoreImageTransform($x, $y, $scale)';
}

const double kStoreMinImageScale = 0.1;

double _safeAspect(double aspect) => aspect.isFinite && aspect > 0 ? aspect : 1;

/// Maior escala em que a imagem (proporção [imageAspect] = L ÷ A) ainda cabe
/// inteira na área (proporção [areaAspect]).
double storeMaxImageScale({
  required double imageAspect,
  required double areaAspect,
}) =>
    math.min(1, _safeAspect(imageAspect) / _safeAspect(areaAspect));

/// Imagem nova: centralizada, do maior tamanho que cabe na área.
StoreImageTransform storeDefaultImageTransform({
  required double imageAspect,
  required double areaAspect,
}) =>
    StoreImageTransform(
      x: 0.5,
      y: 0.5,
      scale: storeMaxImageScale(
        imageAspect: imageAspect,
        areaAspect: areaAspect,
      ),
    );

double _clampCenter(double value, double half) {
  if (half >= 0.5 || !value.isFinite) return 0.5;
  return value.clamp(half, 1 - half).toDouble();
}

/// Proporção travada e imagem sempre dentro da área: a escala fica entre
/// 0,1 e a maior que cabe; o centro, onde a imagem não vaza.
StoreImageTransform clampStoreImageTransform(
  StoreImageTransform t, {
  required double imageAspect,
  required double areaAspect,
}) {
  final image = _safeAspect(imageAspect);
  final area = _safeAspect(areaAspect);
  final maxScale = storeMaxImageScale(imageAspect: image, areaAspect: area);
  final minScale = math.min(kStoreMinImageScale, maxScale);
  final scale = t.scale.isFinite
      ? t.scale.clamp(minScale, maxScale).toDouble()
      : maxScale;
  // Metade da imagem em frações da largura e da altura da área.
  final halfWidth = scale / 2;
  final halfHeight = scale * area / image / 2;
  return StoreImageTransform(
    x: _clampCenter(t.x, halfWidth),
    y: _clampCenter(t.y, halfHeight),
    scale: scale,
  );
}
