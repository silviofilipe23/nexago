import SwiftUI
import WidgetKit

/// Extensão dos widgets da tela de início do nexaGO. Hoje só o "Próximo jogo"
/// (W1). Se o widget for para a extensão `NexagoLiveActivities` em vez de um
/// target próprio, este arquivo sai e o `NextGameWidget()` entra no
/// `NexagoLiveActivitiesBundle`.
@main
struct NexagoWidgetsBundle: WidgetBundle {
  var body: some Widget {
    NextGameWidget()
  }
}
