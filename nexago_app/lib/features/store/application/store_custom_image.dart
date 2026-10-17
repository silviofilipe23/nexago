import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

import '../domain/store_customize_rules.dart';
import '../domain/store_models.dart';

/// A imagem escolhida depois da conferência do cliente: formato, medida e,
/// se reprovou, a regra ([problem]).
class StorePreparedImage {
  const StorePreparedImage({
    required this.bytes,
    required this.format,
    this.widthPx,
    this.heightPx,
    this.problem,
  });

  final Uint8List bytes;

  /// `png`, `jpg` ou `svg`; `null` = formato que a Loja não aceita.
  final String? format;
  final int? widthPx;
  final int? heightPx;
  final StoreImageProblem? problem;

  int get sizeBytes => bytes.length;

  /// Largura ÷ altura (1 sem medida — SVG sem `width`/`viewBox`).
  double get aspect => widthPx != null && heightPx != null && heightPx! > 0
      ? widthPx! / heightPx!
      : 1;
}

/// Confere formato, peso e resolução antes de subir. Imagem raster acima do
/// peso passa por uma compressão leve (lado maior até 3000 px, nunca abaixo
/// do mínimo da config) e é conferida de novo.
Future<StorePreparedImage> prepareStoreCustomImage(
  Uint8List bytes, {
  required String fileName,
  required StoreCustomImageOptions options,
}) async {
  final format = storeImageFormat(bytes, fileName: fileName);
  final size = format == null ? null : storeImageSizeFromBytes(bytes);
  final problem = storeCustomImageProblem(
    options: options,
    format: format,
    sizeBytes: bytes.length,
    widthPx: size?.width,
    heightPx: size?.height,
  );
  final original = StorePreparedImage(
    bytes: bytes,
    format: format,
    widthPx: size?.width,
    heightPx: size?.height,
    problem: problem,
  );
  if (problem != StoreImageProblem.size ||
      format == null ||
      format == 'svg' ||
      size == null ||
      size.width < options.minWidthPx ||
      size.height < options.minHeightPx) {
    return original;
  }

  final target = storeCustomResizeTarget(
    width: size.width,
    height: size.height,
    minWidthPx: options.minWidthPx,
    minHeightPx: options.minHeightPx,
  );
  // PNG do mesmo tamanho não fica mais leve; JPEG ainda ganha recodificando.
  if (target == null && format == 'png') return original;
  final Uint8List? compressed;
  try {
    compressed = await compute(
      _compress,
      (
        bytes: bytes,
        png: format == 'png',
        width: target?.width ?? size.width,
        height: target?.height ?? size.height,
      ),
    );
  } catch (_) {
    return original;
  }
  if (compressed == null) return original;
  final newSize = storeImageSizeFromBytes(compressed);
  final newProblem = storeCustomImageProblem(
    options: options,
    format: format,
    sizeBytes: compressed.length,
    widthPx: newSize?.width,
    heightPx: newSize?.height,
  );
  if (newProblem != null) return original;
  return StorePreparedImage(
    bytes: compressed,
    format: format,
    widthPx: newSize?.width,
    heightPx: newSize?.height,
  );
}

/// Roda fora da thread da interface (`compute`).
Uint8List? _compress(
  ({Uint8List bytes, bool png, int width, int height}) job,
) {
  final decoded = img.decodeImage(job.bytes);
  if (decoded == null) return null;
  final resized = decoded.width == job.width && decoded.height == job.height
      ? decoded
      : img.copyResize(
          decoded,
          width: job.width,
          height: job.height,
          interpolation: img.Interpolation.average,
        );
  return job.png
      ? img.encodePng(resized, level: 6)
      : img.encodeJpg(resized, quality: 85);
}
