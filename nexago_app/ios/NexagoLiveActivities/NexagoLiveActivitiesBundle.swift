import SwiftUI
import WidgetKit

/// Extensão WidgetKit do nexaGO. Live Activities: o Pix pendente, a próxima
/// partida do dia de torneio (Modo Focus) e a reserva de quadra. Widget da tela
/// de início e da tela bloqueada: o "Próximo jogo" da Agenda, que lê o App Group
/// (por isso a extensão tem `NexagoLiveActivities.entitlements`).
@main
struct NexagoLiveActivitiesBundle: WidgetBundle {
  var body: some Widget {
    PixPaymentLiveActivity()
    NextMatchLiveActivity()
    BookingLiveActivity()
    NextGameWidget()
  }
}
