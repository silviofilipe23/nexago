import FirebaseCore
import FirebaseMessaging
import Flutter
import UIKit

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

    return result
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
  }
}
