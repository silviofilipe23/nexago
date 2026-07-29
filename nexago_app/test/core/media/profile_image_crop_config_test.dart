import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/media/profile_image_crop_config.dart';

void main() {
  group('ProfileImageCropTarget', () {
    test('avatar uses square circle crop', () {
      const target = ProfileImageCropTarget.avatar;
      expect(target.aspectRatio, 1);
      expect(target.withCircleUi, isTrue);
      expect(target.useCircleCrop, isTrue);
      expect(target.maxOutputWidth, 1024);
    });

    test('cover uses wide aspect ratio', () {
      const target = ProfileImageCropTarget.cover;
      expect(target.aspectRatio, 2.63);
      expect(target.withCircleUi, isFalse);
      expect(target.useCircleCrop, isFalse);
      expect(target.maxOutputWidth, 2200);
    });

    test('highlight uses square crop without circle mask', () {
      const target = ProfileImageCropTarget.highlight;
      expect(target.aspectRatio, 1);
      expect(target.withCircleUi, isFalse);
      expect(target.useCircleCrop, isFalse);
      expect(target.maxOutputWidth, 1600);
    });
  });
}
