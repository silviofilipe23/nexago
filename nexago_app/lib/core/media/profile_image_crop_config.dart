/// Alvo do recorte de imagem no perfil do atleta.
enum ProfileImageCropTarget {
  avatar,
  cover,
  highlight,
}

extension ProfileImageCropTargetX on ProfileImageCropTarget {
  /// Proporção da moldura (largura / altura).
  double get aspectRatio => switch (this) {
        ProfileImageCropTarget.avatar => 1,
        ProfileImageCropTarget.cover => coverAspectRatio,
        ProfileImageCropTarget.highlight => 1,
      };

  /// Proporção da capa (largura / altura).
  ///
  /// TEM de casar com a área onde a capa aparece no perfil público: lá ela
  /// ocupa a largura inteira da tela, e o `BoxFit.cover` descarta o que sobra.
  /// Com o valor antigo (2.63, panorâmico) o atleta recortava uma faixa larga
  /// e o app mostrava só o miolo dela — metade do recorte ia fora.
  ///
  /// 4:3 fica a menos de 6% das telas comuns (375→1.25, 393→1.31, 430→1.43),
  /// então o que o `cover` apara é desprezível em qualquer aparelho.
  static const double coverAspectRatio = 4 / 3;

  bool get withCircleUi => this == ProfileImageCropTarget.avatar;

  bool get useCircleCrop => this == ProfileImageCropTarget.avatar;

  String get title => switch (this) {
        ProfileImageCropTarget.avatar => 'Ajustar foto de perfil',
        ProfileImageCropTarget.cover => 'Ajustar capa',
        ProfileImageCropTarget.highlight => 'Ajustar foto de destaque',
      };

  /// Largura máxima após recorte (redimensionamento opcional).
  int get maxOutputWidth => switch (this) {
        ProfileImageCropTarget.avatar => 1024,
        ProfileImageCropTarget.cover => 2200,
        ProfileImageCropTarget.highlight => 1600,
      };
}
