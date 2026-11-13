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
