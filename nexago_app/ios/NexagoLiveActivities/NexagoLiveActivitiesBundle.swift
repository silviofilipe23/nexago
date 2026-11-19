import SwiftUI
import WidgetKit

/// Extensão das Live Activities do nexaGO: o Pix pendente e a próxima partida
/// do dia de torneio (Modo Focus).
@main
struct NexagoLiveActivitiesBundle: WidgetBundle {
  var body: some Widget {
    PixPaymentLiveActivity()
    NextMatchLiveActivity()
  }
}
