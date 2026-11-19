import SwiftUI
import WidgetKit

/// Extensão das Live Activities do nexaGO: o Pix pendente, a próxima partida
/// do dia de torneio (Modo Focus) e a reserva de quadra.
@main
struct NexagoLiveActivitiesBundle: WidgetBundle {
  var body: some Widget {
    PixPaymentLiveActivity()
    NextMatchLiveActivity()
    BookingLiveActivity()
  }
}
