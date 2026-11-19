package br.com.nexago.nexago_app

import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Widget "Próximo jogo": o Dart grava o snapshot da Agenda
        // (`lib/core/home_widget/agenda_widget_channel.dart`).
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "nexago/home_widget")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "saveAgendaSnapshot" -> {
                        val json = call.argument<String>("json")
                        if (json == null) {
                            result.error("bad_args", "json ausente", null)
                        } else {
                            NextGameWidgetProvider.saveSnapshot(applicationContext, json)
                            result.success(null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
