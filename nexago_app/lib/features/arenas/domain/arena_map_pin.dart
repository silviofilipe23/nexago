/// Natureza do pino no mapa da busca.
///
/// Decide só a opacidade: o desenho é o mesmo para todos. Sem preço escrito no
/// pino, o que o mapa comunica de longe é onde dá para jogar hoje.
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
  });

  final String arenaId;
  final double latitude;
  final double longitude;
  final ArenaMapPinKind kind;
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
