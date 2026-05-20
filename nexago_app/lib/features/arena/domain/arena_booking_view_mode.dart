/// Modo de visualização da lista de reservas no painel do gestor.
enum BookingViewMode {
  today,
  tomorrow,
  upcoming,
  past,
}

extension BookingViewModeX on BookingViewMode {
  String get label => switch (this) {
        BookingViewMode.today => 'Hoje',
        BookingViewMode.tomorrow => 'Amanhã',
        BookingViewMode.upcoming => 'Futuras',
        BookingViewMode.past => 'Passadas',
      };
}
