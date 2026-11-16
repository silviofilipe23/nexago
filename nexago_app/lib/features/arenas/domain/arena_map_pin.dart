/// Natureza do pino no mapa da busca.
///
/// Decide tamanho, opacidade e quem fica por cima: o desenho é o mesmo para
/// todos. Parceira (com ou sem horário) é maior e nunca apaga; só a
/// pré-cadastrada fica menor e apagada.
enum ArenaMapPinKind {
  /// Tem horário livre no filtro atual.
  available,

  /// Arena parceira sem horário livre no filtro.
  unavailable,

  /// Arena pré-cadastrada (sem quadra, sem slot, sem preço).
  unclaimed,
}

/// Um pino de arena no mapa da aba Reservar.
///
/// Modelo puro e já resolvido: quem desenha não precisa saber de filtro,
/// preço nem favorito.
class ArenaMapPin {
  const ArenaMapPin({
    required this.arenaId,
    required this.latitude,
    required this.longitude,
    required this.kind,
    this.iconImageId,
    this.selected = false,
  });

  final String arenaId;
  final double latitude;
  final double longitude;
  final ArenaMapPinKind kind;

  /// Imagem própria do pino, registrada no mapa por `ArenaMapView.pinImages`
  /// (ex.: a logo de um parceiro do Clube de Vantagens). Nulo, ou ainda não
  /// registrada, = a arte padrão da quadra — é o caso de toda arena.
  final String? iconImageId;

  /// Pino em destaque (o tocado): fica maior e por cima dos outros. Só vale
  /// para pino com [iconImageId]; a arte da quadra não muda.
  final bool selected;
}

/// Caixa que envolve um conjunto de pinos, para enquadrar a câmera.
class ArenaMapBounds {
  const ArenaMapBounds({
    required this.minLatitude,
    required this.minLongitude,
    required this.maxLatitude,
    required this.maxLongitude,
  });

  final double minLatitude;
  final double minLongitude;
  final double maxLatitude;
  final double maxLongitude;

  double get centerLatitude => (minLatitude + maxLatitude) / 2;
  double get centerLongitude => (minLongitude + maxLongitude) / 2;

  /// Todos os pinos no mesmo ponto: enquadrar por caixa daria zoom infinito,
  /// então quem consome usa um zoom fixo centrado.
  bool get isSinglePoint =>
      minLatitude == maxLatitude && minLongitude == maxLongitude;
}
