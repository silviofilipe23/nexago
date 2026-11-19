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

// MARK: - Próxima partida (Modo Focus)

/// Ponte da Live Activity "minha próxima partida"
/// (`lib/core/live_activity/next_match_live_activity_service.dart`). Canal
/// próprio: o Flutter aceita um handler só por canal, e dividir o do Pix
/// faria um serviço roubar os tokens do outro.
///
/// - `isSupported` → o atleta deixou Live Activities ligadas?
/// - `startNextMatch({tournamentId, tournamentName, categoryName, state})` →
///   `state` é o JSON do servidor (`NextMatchContentState`); reabrir o Focus
///   com o card vivo só atualiza o card;
/// - `resumeNextMatch` → volta a observar o token dos cards vivos;
/// - Swift → Dart: `onPushToken({tournamentId, token})`.
enum NextMatchLiveActivityChannel {
  private static var channel: FlutterMethodChannel?

  static func register(messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(
      name: "nexago/live_activity_next_match",
      binaryMessenger: messenger
    )
    self.channel = channel
    channel.setMethodCallHandler { call, result in
      guard #available(iOS 16.2, *) else {
        result(call.method == "isSupported" ? false : nil)
        return
      }
      NextMatchLiveActivityController.handle(call, result: result)
    }
  }

  fileprivate static func sendPushToken(tournamentId: String, token: String) {
    DispatchQueue.main.async {
      channel?.invokeMethod(
        "onPushToken",
        arguments: ["tournamentId": tournamentId, "token": token]
      )
    }
  }
}

@available(iOS 16.2, *)
private enum NextMatchLiveActivityController {
  private static var tokenTasks: [String: Task<Void, Never>] = [:]

  static func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "isSupported":
      result(ActivityAuthorizationInfo().areActivitiesEnabled)
    case "startNextMatch":
      start(call.arguments as? [String: Any] ?? [:], result: result)
    case "resumeNextMatch":
      for activity in Activity<NextMatchAttributes>.activities {
        observePushToken(of: activity, tournamentId: activity.attributes.tournamentId)
      }
      result(nil)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  /// O horário previsto é o `staleDate`: passou dele sem a partida começar, o
  /// card mostra o atraso sozinho.
  private static func content(
    _ state: NextMatchAttributes.ContentState
  ) -> ActivityContent<NextMatchAttributes.ContentState> {
    // Horário já passado não vira `staleDate`: activity que nasce "stale" o iOS
    // não desenha. O card mostra o atraso comparando com o relógio.
    let phase = NextMatchPhase(wire: state.phase)
    if phase == .playing {
      // Placar: sem push novo em 3 min (mesmo valor do servidor), ele se
      // declara desatualizado em vez de se passar por ao vivo.
      return ActivityContent(state: state, staleDate: Date().addingTimeInterval(3 * 60))
    }
    let scheduled = phase == .scheduled ? state.scheduleTime : nil
    let stale = scheduled.flatMap { $0 > Date() ? $0 : nil }
    return ActivityContent(state: state, staleDate: stale)
  }

  private static func start(_ args: [String: Any], result: @escaping FlutterResult) {
    guard
      let tournamentId = (args["tournamentId"] as? String)?
        .trimmingCharacters(in: .whitespaces),
      !tournamentId.isEmpty,
      let stateJson = args["state"] as? String,
      let state = try? JSONDecoder().decode(
        NextMatchAttributes.ContentState.self,
        from: Data(stateJson.utf8)
      )
    else {
      result(FlutterError(code: "bad_args", message: "startNextMatch sem torneio/estado", details: nil))
      return
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      result(nil)
      return
    }

    let activities = Activity<NextMatchAttributes>.activities
    // Reabrir o Focus: o card vivo recebe o estado fresco, sem nascer outro.
    // Só serve um card VIVO: um encerrado (limite de 8h do iOS, ou "fim do
    // dia" ainda na tela) continua na lista, e atualizá-lo não faz nada.
    let alive = activities.first {
      $0.attributes.tournamentId == tournamentId &&
        ($0.activityState == .active || $0.activityState == .stale)
    }
    if let existing = alive {
      let fresh = content(state)
      Task { await existing.update(fresh) }
      observePushToken(of: existing, tournamentId: tournamentId)
      result(existing.id)
      return
    }
    // Um card por vez: o de outro torneio (ou um já encerrado) sai.
    for other in activities {
      tokenTasks.removeValue(forKey: other.attributes.tournamentId)?.cancel()
      Task { await other.end(nil, dismissalPolicy: .immediate) }
    }

    let attributes = NextMatchAttributes(
      tournamentId: tournamentId,
      tournamentName: args["tournamentName"] as? String ?? "",
      categoryName: args["categoryName"] as? String ?? ""
    )
    do {
      let activity = try Activity.request(
        attributes: attributes,
        content: content(state),
        pushType: .token
      )
      observePushToken(of: activity, tournamentId: tournamentId)
      result(activity.id)
    } catch {
      result(FlutterError(code: "start_failed", message: error.localizedDescription, details: nil))
    }
  }

  private static func observePushToken(
    of activity: Activity<NextMatchAttributes>,
    tournamentId: String
  ) {
    tokenTasks[tournamentId]?.cancel()
    tokenTasks[tournamentId] = Task {
      for await data in activity.pushTokenUpdates {
        let token = data.map { String(format: "%02x", $0) }.joined()
        NextMatchLiveActivityChannel.sendPushToken(tournamentId: tournamentId, token: token)
      }
    }
  }
}
