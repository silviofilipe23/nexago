import ActivityKit
import Flutter
import Foundation

/// Ponte das Live Activities com o Dart
/// (`lib/core/live_activity/pix_live_activity_service.dart`).
///
/// - `startPix(args)` → id da activity (reaproveita a do mesmo Pix);
/// - `endPix({paymentId, phase})` → `phase` nula some na hora;
/// - `resumePix` → volta a observar o token dos cards vivos (app reaberto);
/// - Swift → Dart: `onPushToken({paymentId, token})` sempre que o iOS
///   entrega/troca o token da activity, que o servidor usa nos pushes.
///
/// O app roda no iOS 15; abaixo do 16.2 tudo responde como "não suportado".
enum LiveActivityChannel {
  private static var channel: FlutterMethodChannel?

  static func register(messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(name: "nexago/live_activity", binaryMessenger: messenger)
    self.channel = channel
    channel.setMethodCallHandler { call, result in
      guard #available(iOS 16.2, *) else {
        result(call.method == "isSupported" ? false : nil)
        return
      }
      PixLiveActivityController.handle(call, result: result)
    }
  }

  fileprivate static func sendPushToken(paymentId: String, token: String) {
    DispatchQueue.main.async {
      channel?.invokeMethod("onPushToken", arguments: ["paymentId": paymentId, "token": token])
    }
  }
}

@available(iOS 16.2, *)
private enum PixLiveActivityController {
  /// Quanto o card final fica na tela quando é a própria tela que encerra
  /// (mesmos valores do servidor).
  private static let paidDismissal: TimeInterval = 30 * 60
  private static let expiredDismissal: TimeInterval = 15 * 60

  private static var tokenTasks: [String: Task<Void, Never>] = [:]

  static func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "isSupported":
      result(ActivityAuthorizationInfo().areActivitiesEnabled)
    case "startPix":
      start(call.arguments as? [String: Any] ?? [:], result: result)
    case "endPix":
      end(call.arguments as? [String: Any] ?? [:], result: result)
    case "resumePix":
      // App morto e reaberto com o card vivo: ninguém observava mais o token,
      // e o iOS pode trocá-lo — o servidor mandaria push para o token velho.
      for activity in Activity<PixPaymentAttributes>.activities {
        observePushToken(of: activity, paymentId: activity.attributes.paymentId)
      }
      result(nil)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private static func activities(for paymentId: String) -> [Activity<PixPaymentAttributes>] {
    Activity<PixPaymentAttributes>.activities.filter { $0.attributes.paymentId == paymentId }
  }

  private static func start(_ args: [String: Any], result: @escaping FlutterResult) {
    guard
      let paymentId = (args["paymentId"] as? String)?.trimmingCharacters(in: .whitespaces),
      !paymentId.isEmpty,
      let createdAtMs = (args["createdAtMs"] as? NSNumber)?.doubleValue,
      let expiresAtMs = (args["expiresAtMs"] as? NSNumber)?.doubleValue
    else {
      result(FlutterError(code: "bad_args", message: "startPix sem paymentId/prazo", details: nil))
      return
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      result(nil)
      return
    }

    // Reabrir a tela do mesmo Pix não cria um segundo card.
    if let existing = activities(for: paymentId).first {
      observePushToken(of: existing, paymentId: paymentId)
      result(existing.id)
      return
    }
    // Só um Pix pendente por vez: um novo Pix (outra reserva) aposenta o anterior.
    for other in Activity<PixPaymentAttributes>.activities {
      tokenTasks.removeValue(forKey: other.attributes.paymentId)?.cancel()
      Task { await other.end(nil, dismissalPolicy: .immediate) }
    }

    let expiresAt = Date(timeIntervalSince1970: expiresAtMs / 1000)
    let attributes = PixPaymentAttributes(
      paymentId: paymentId,
      title: args["title"] as? String ?? "Pix",
      amountLabel: args["amountLabel"] as? String ?? "",
      summary: args["summary"] as? String ?? "",
      detail: args["detail"] as? String ?? "",
      createdAt: Date(timeIntervalSince1970: createdAtMs / 1000),
      expiresAt: expiresAt
    )
    let content = ActivityContent(
      state: PixPaymentAttributes.ContentState(phase: PixPaymentPhase.waiting.rawValue),
      staleDate: expiresAt
    )
    do {
      let activity = try Activity.request(attributes: attributes, content: content, pushType: .token)
      observePushToken(of: activity, paymentId: paymentId)
      result(activity.id)
    } catch {
      result(FlutterError(code: "start_failed", message: error.localizedDescription, details: nil))
    }
  }

  private static func end(_ args: [String: Any], result: @escaping FlutterResult) {
    guard let paymentId = args["paymentId"] as? String, !paymentId.isEmpty else {
      result(nil)
      return
    }
    tokenTasks.removeValue(forKey: paymentId)?.cancel()
    let phase = (args["phase"] as? String).map(PixPaymentPhase.init(wire:))
    for activity in activities(for: paymentId) {
      Task {
        guard let phase, !phase.isOpen else {
          await activity.end(nil, dismissalPolicy: .immediate)
          return
        }
        let linger = phase == .paid ? paidDismissal : expiredDismissal
        await activity.end(
          ActivityContent(state: .init(phase: phase.rawValue), staleDate: nil),
          dismissalPolicy: .after(Date().addingTimeInterval(linger))
        )
      }
    }
    result(nil)
  }

  private static func observePushToken(of activity: Activity<PixPaymentAttributes>, paymentId: String) {
    tokenTasks[paymentId]?.cancel()
    tokenTasks[paymentId] = Task {
      for await data in activity.pushTokenUpdates {
        let token = data.map { String(format: "%02x", $0) }.joined()
        LiveActivityChannel.sendPushToken(paymentId: paymentId, token: token)
      }
    }
  }
}
