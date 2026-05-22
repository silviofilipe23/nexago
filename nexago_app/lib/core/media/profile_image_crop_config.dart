/// Alvo do recorte de imagem no perfil do atleta.
enum ProfileImageCropTarget {
  avatar,
  cover,
}

extension ProfileImageCropTargetX on ProfileImageCropTarget {
  /// Proporção da moldura (largura / altura).
  double get aspectRatio => switch (this) {
        ProfileImageCropTarget.avatar => 1,
        ProfileImageCropTarget.cover => coverAspectRatio,
      };

  static const double coverAspectRatio = 2.63;

  bool get withCircleUi => this == ProfileImageCropTarget.avatar;

  bool get useCircleCrop => this == ProfileImageCropTarget.avatar;

  String get title => switch (this) {
        ProfileImageCropTarget.avatar => 'Ajustar foto de perfil',
        ProfileImageCropTarget.cover => 'Ajustar capa',
      };

  /// Largura máxima após recorte (redimensionamento opcional).
  int get maxOutputWidth => switch (this) {
        ProfileImageCropTarget.avatar => 1024,
        ProfileImageCropTarget.cover => 2200,
      };
}
