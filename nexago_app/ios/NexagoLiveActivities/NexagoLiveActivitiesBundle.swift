import SwiftUI
import WidgetKit

/// Extensão das Live Activities do nexaGO. Hoje só o Pix pendente; o placar
/// ao vivo (spec 2026-09-08-live-activity-ios-fase2) entra aqui também.
@main
struct NexagoLiveActivitiesBundle: WidgetBundle {
  var body: some Widget {
    PixPaymentLiveActivity()
  }
}
