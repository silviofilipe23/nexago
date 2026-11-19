import ActivityKit
import Foundation

/// Live Activity do Pix pendente. Compilado nos DOIS alvos: no app (Runner),
/// que inicia e encerra a activity, e na extensão `NexagoLiveActivities`, que
/// desenha o card. O ActivityKit casa os dois pelo nome do tipo.
///
/// CONTRATOS (mudar um lado sem o outro faz o card parar sem erro):
/// - argumentos do `startPix`: `PixLiveActivityRequest.toChannelArgs()` no Dart;
/// - `content-state` do push: `{"phase": "waiting|urgent|paid|expired"}`, de
///   `functions/src/pix-live-activity.ts`.
@available(iOS 16.1, *)
struct PixPaymentAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    /// Texto cru de propósito: fase desconhecida não pode derrubar o decode
    /// do push (o card simplesmente não atualizaria). Ler por `PixPaymentPhase`.
    var phase: String
  }

  var paymentId: String
  /// "Pix da reserva"
  var title: String
  /// "R$ 120,00"
  var amountLabel: String
  /// "Reserva · Arena Sol · Quadra 2"
  var summary: String
  /// "Sáb, 21/11 · 9h–10h"
  var detail: String
  /// Início do anel; o fim é `expiresAt`.
  var createdAt: Date
  var expiresAt: Date
}

enum PixPaymentPhase: String {
  case waiting
  case urgent
  case paid
  case expired

  init(wire: String) {
    self = PixPaymentPhase(rawValue: wire) ?? .waiting
  }

  var isOpen: Bool { self == .waiting || self == .urgent }
}
