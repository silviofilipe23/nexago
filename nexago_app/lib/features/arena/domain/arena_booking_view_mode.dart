/// Modo de visualização da lista de reservas no painel do gestor.
enum BookingViewMode {
  /// Filtro por dia (com seletor de data).
  today,

  /// Reservas com data ≥ hoje, ordenadas e agrupadas por dia.
  upcoming,
}

extension BookingViewModeX on BookingViewMode {
  String get label => switch (this) {
        BookingViewMode.today => 'Hoje',
        BookingViewMode.upcoming => 'Futuras',
      };
}
