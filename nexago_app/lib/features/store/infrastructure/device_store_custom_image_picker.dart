import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../domain/store_customize_service.dart';

/// Galeria e câmera pelo `image_picker` (JPEG a 92%: compressão leve, sem
/// reduzir a resolução — PNG continua PNG); arquivos pelo `file_picker`, só
/// com as extensões que o produto aceita.
class DeviceStoreCustomImagePicker implements StoreCustomImagePicker {
  DeviceStoreCustomImagePicker({ImagePicker? picker})
      : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  static const int _jpegQuality = 92;

  @override
  Future<StorePickedImage?> pick(
    StoreImageSource source, {
    required List<String> formats,
  }) async {
    switch (source) {
      case StoreImageSource.photos:
      case StoreImageSource.camera:
        final file = await _picker.pickImage(
          source: source == StoreImageSource.camera
              ? ImageSource.camera
              : ImageSource.gallery,
          imageQuality: _jpegQuality,
          // Evita falhas do PHPicker ao pedir metadados completos (iOS).
          requestFullMetadata: false,
        );
        if (file == null) return null;
        final bytes = await file.readAsBytes();
        // O nome do picker é temporário ("image_picker_782BD….jpg"): o card
        // mostra a origem, com a extensão (reserva do formato).
        final dot = file.name.lastIndexOf('.');
        final ext = dot < 0 ? '' : file.name.substring(dot);
        final label = source == StoreImageSource.camera
            ? 'Foto da câmera'
            : 'Foto da galeria';
        return bytes.isEmpty
            ? null
            : StorePickedImage(bytes: bytes, fileName: '$label$ext');
      case StoreImageSource.files:
        final result = await FilePicker.platform.pickFiles(
          type: FileType.custom,
          allowedExtensions: [
            for (final f in formats) ...[f, if (f == 'jpg') 'jpeg'],
          ],
          withData: true,
        );
        final file = result?.files.singleOrNull;
        final bytes = file?.bytes;
        if (file == null || bytes == null || bytes.isEmpty) return null;
        return StorePickedImage(bytes: bytes, fileName: file.name);
    }
  }
}

final storeCustomImagePickerProvider = Provider<StoreCustomImagePicker>((ref) {
  return DeviceStoreCustomImagePicker();
});
