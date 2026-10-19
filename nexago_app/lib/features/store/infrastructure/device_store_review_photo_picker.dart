import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../domain/store_customize_service.dart';
import '../domain/store_review_service.dart';

/// Galeria e câmera pelo `image_picker`, já reduzida a 1600 px no lado maior
/// e recomprimida a 85% — foto de avaliação não precisa da resolução da
/// câmera, e o redimensionamento faz o HEIC do iOS sair em JPEG.
class DeviceStoreReviewPhotoPicker implements StoreReviewPhotoPicker {
  DeviceStoreReviewPhotoPicker({ImagePicker? picker})
    : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  static const double _maxSide = 1600;
  static const int _quality = 85;

  @override
  Future<StorePickedImage?> pick(StoreImageSource source) async {
    final file = await _picker.pickImage(
      source: source == StoreImageSource.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      maxWidth: _maxSide,
      maxHeight: _maxSide,
      imageQuality: _quality,
      // Evita falhas do PHPicker ao pedir metadados completos (iOS).
      requestFullMetadata: false,
    );
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    return bytes.isEmpty
        ? null
        : StorePickedImage(bytes: bytes, fileName: file.name);
  }
}

final storeReviewPhotoPickerProvider = Provider<StoreReviewPhotoPicker>((ref) {
  return DeviceStoreReviewPhotoPicker();
});
