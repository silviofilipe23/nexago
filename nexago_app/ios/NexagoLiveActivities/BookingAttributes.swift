import ActivityKit
import Foundation

/// Live Activity da reserva de quadra (Chegar → Em quadra → Placar). Compilado
/// nos DOIS alvos: no app (Runner), que inicia a activity, e na extensão, que
/// desenha o card. O ActivityKit casa os dois pelo nome do tipo.
///
/// CONTRATOS (mudar um lado sem o outro faz o card parar sem erro):
/// - argumentos do `startBooking`: `BookingLiveActivityRequest.toChannelArgs()`
///   no Dart;
/// - `content-state` do push: `{"phase": "onCourt|finished|canceled"}`, de
///   `functions/src/booking-live-activity.ts`.
@available(iOS 16.1, *)
struct BookingAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    /// Texto cru: fase desconhecida não pode derrubar o decode do push.
    /// Ler por `BookingPhase`.
    var phase: String
  }

  var bookingId: String
  /// "Arena Orla"
  var arenaName: String
  /// "Quadra 2"
  var courtName: String
  var startAt: Date
  var endAt: Date
  /// "19:00" / "20:00" — já no relógio do aparelho que reservou.
  var startLabel: String
  var endLabel: String
  /// "3 de 4 confirmados"
  var confirmed: Int
  var totalSlots: Int
  /// Início do anel de "Chegar" (quando o card nasceu).
  var createdAt: Date
}

enum BookingPhase: String {
  case upcoming
  case onCourt
  case finished
  case canceled

  init(wire: String) {
    self = BookingPhase(rawValue: wire) ?? .upcoming
  }
}
