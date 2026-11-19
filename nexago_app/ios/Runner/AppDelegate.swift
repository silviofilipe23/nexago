import FirebaseCore
import FirebaseMessaging
import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Inicializa Firebase nativo antes do engine (FCM/APNs). O Dart também chama
    // Firebase.initializeApp; se o default app já existir, o plugin reutiliza.
    FirebaseApp.configure()

    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)

    // Com FlutterImplicitEngineDelegate os plugins registram depois do didFinishLaunching.
    // O firebase_messaging escuta UIApplicationDidFinishLaunchingNotification no init do
    // plugin — tarde demais — e nunca chama registerForRemoteNotifications.
    application.registerForRemoteNotifications()

    // O iOS guarda o último número de badge até o próprio app trocar, e o app
    // nunca trocava: um push com `badge` deixava o ícone com o mesmo número pra
    // sempre. `didBecomeActiveNotification` sai também com UIScene, onde o
    // `applicationDidBecomeActive` do delegate não é chamado.
    NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { _ in
      AppDelegate.clearIconBadge()
    }

    return result
  }

  private static func clearIconBadge() {
    if #available(iOS 16.0, *) {
      UNUserNotificationCenter.current().setBadgeCount(0, withCompletionHandler: nil)
    } else {
      UIApplication.shared.applicationIconBadgeNumber = 0
    }
  }

  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    Messaging.messaging().apnsToken = deviceToken
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    InterfaceStyleChannel.register(messenger: engineBridge.applicationRegistrar.messenger())
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "NexaQuickActions") {
      QuickActionsChannel.register(with: registrar)
    }
  }
}

/// Aplica o tema do app (claro/escuro/sistema) às janelas do iOS.
///
/// A barra e a tab bar Liquid Glass são views nativas: o título segue a
/// aparência da janela, não o `Theme` do Flutter. Sem isso, com o iPhone
/// claro e o app escuro, o título saía preto sobre o fundo escuro.
/// Lado Dart: `lib/core/theme/native_interface_style.dart`.
private enum InterfaceStyleChannel {
  private static var style: UIUserInterfaceStyle = .unspecified
  private static var observer: NSObjectProtocol?

  static func register(messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(
      name: "nexago/interface_style",
      binaryMessenger: messenger
    )
    channel.setMethodCallHandler { call, result in
      guard call.method == "setInterfaceStyle" else {
        result(FlutterMethodNotImplemented)
        return
      }
      switch call.arguments as? String {
      case "light": style = .light
      case "dark": style = .dark
      default: style = .unspecified
      }
      applyToAllWindows()
      result(nil)
    }

    // Janela que aparece depois (alerta, teclado, cena nova) herda o estilo.
    if observer == nil {
      observer = NotificationCenter.default.addObserver(
        forName: UIWindow.didBecomeVisibleNotification,
        object: nil,
        queue: .main
      ) { note in
        (note.object as? UIWindow)?.overrideUserInterfaceStyle = style
      }
    }
  }

  private static func applyToAllWindows() {
    for scene in UIApplication.shared.connectedScenes {
      guard let windowScene = scene as? UIWindowScene else { continue }
      for window in windowScene.windows {
        window.overrideUserInterfaceStyle = style
      }
    }
  }
}

/// Quick Actions: o menu do toque longo no ícone do app (Tela de Início e Dock).
///
/// O Dart monta os itens e grava com `setItems` (todos dinâmicos). O toque
/// fica guardado em `pending` até o Dart buscar com `takePendingAction`: no
/// cold start ele chega antes do Dart estar pronto. Com o app vivo, o nativo
/// também avisa por `actionAvailable`.
///
/// Registra como plugin no ciclo de vida da cena do Flutter em vez de
/// sobrescrever o `SceneDelegate`: o `FlutterSceneDelegate` implementa esses
/// métodos sem declarar no header, e um override sem `super` engole o ciclo
/// de vida do engine. Lado Dart: `lib/core/quick_actions/quick_actions_channel.dart`.
final class QuickActionsChannel: NSObject, FlutterPlugin, FlutterSceneLifeCycleDelegate {
  private let channel: FlutterMethodChannel
  private var pending: UIApplicationShortcutItem?

  private init(channel: FlutterMethodChannel) {
    self.channel = channel
  }

  static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "nexago/quick_actions",
      binaryMessenger: registrar.messenger()
    )
    let instance = QuickActionsChannel(channel: channel)
    registrar.addMethodCallDelegate(instance, channel: channel)
    registrar.addApplicationDelegate(instance)
    registrar.addSceneDelegate(instance)
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "setItems":
      let raw = call.arguments as? [[String: Any]] ?? []
      UIApplication.shared.shortcutItems = raw.compactMap(Self.shortcutItem(from:))
      result(nil)
    case "takePendingAction":
      guard let item = pending else {
        result(nil)
        return
      }
      pending = nil
      let payload = item.userInfo?.compactMapValues { $0 as? String } ?? [:]
      result(["type": item.type, "payload": payload])
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private static func shortcutItem(from raw: [String: Any]) -> UIApplicationShortcutItem? {
    guard let type = raw["type"] as? String, let title = raw["title"] as? String else {
      return nil
    }
    let icon = (raw["icon"] as? String).map { UIApplicationShortcutIcon(systemImageName: $0) }
    let payload = (raw["payload"] as? [String: String] ?? [:])
      .mapValues { $0 as NSString as NSSecureCoding }
    return UIApplicationShortcutItem(
      type: type,
      localizedTitle: title,
      localizedSubtitle: raw["subtitle"] as? String,
      icon: icon,
      userInfo: payload
    )
  }

  private func receive(_ item: UIApplicationShortcutItem) {
    pending = item
    channel.invokeMethod("actionAvailable", arguments: nil)
  }

  // Cold start: o toque que abriu o app vem nas opções de conexão da cena.
  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions?
  ) -> Bool {
    if let item = connectionOptions?.shortcutItem {
      receive(item)
    }
    // Não consome a conexão: outros plugins também precisam dela.
    return false
  }

  // App em segundo plano.
  func windowScene(
    _ windowScene: UIWindowScene,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) -> Bool {
    receive(shortcutItem)
    completionHandler(true)
    return true
  }

  // Sem cena (não usado hoje, mas o iOS chama aqui se a cena sair do Info.plist).
  func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) -> Bool {
    receive(shortcutItem)
    completionHandler(true)
    return true
  }
}
