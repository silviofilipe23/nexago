import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:screen_brightness/screen_brightness.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Modo Sol da mesa: tema claro de alto contraste (só preto, branco e cores sólidas) pro
/// mesário que trabalha sob sol direto. Vale SÓ nas telas da mesa — não mexe no tema do app.
///
/// O "modo normal" é o tema que o app já está usando (claro ou escuro); o Modo Sol é um
/// terceiro estado por cima dele. A troca não recarrega nada da partida: é só `Theme`.

/// Chave de `SharedPreferences`. Guarda `dark` (normal) ou `sun`; `auto` está reservado pro
/// sensor de luz e hoje cai em normal.
const mesaThemePrefKey = 'prefs.mesa.theme';

/// Liga/desliga o Modo Sol e lembra a escolha neste aparelho.
final mesaSunModeProvider = NotifierProvider<MesaSunModeNotifier, bool>(
  MesaSunModeNotifier.new,
);

class MesaSunModeNotifier extends Notifier<bool> {
  bool _touched = false;

  @override
  bool build() {
    _load();
    return false;
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(mesaThemePrefKey);
      // Se o mesário já mexeu enquanto a leitura rodava, a escolha dele vale mais.
      if (!_touched && stored == 'sun') state = true;
    } catch (_) {
      // Sem persistência nesta sessão (canal indisponível): segue em memória.
    }
  }

  Future<void> set(bool sun) async {
    _touched = true;
    state = sun;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(mesaThemePrefKey, sun ? 'sun' : 'dark');
    } catch (_) {}
  }

  Future<void> toggle() => set(!state);
}

/// Marca, no `ThemeData`, que o Modo Sol está ativo — é o que os componentes consultam.
class MesaSunTheme extends ThemeExtension<MesaSunTheme> {
  const MesaSunTheme();

  @override
  MesaSunTheme copyWith() => this;

  @override
  MesaSunTheme lerp(ThemeExtension<MesaSunTheme>? other, double t) => this;
}

/// Tokens do Modo Sol (spec "Placar · Modo Sol").
abstract final class MesaSun {
  MesaSun._();

  static const white = Color(0xFFFFFFFF);
  static const ink = Color(0xFF000000);
  static const surface = Color(0xFFF3F3F1);
  static const surfaceStrong = Color(0xFFE6E6E3);
  static const orange = Color(0xFFFF6A1A);
  static const orangeTint = Color(0xFFFFF1E6);

  /// Laranja como TEXTO sobre branco (≥ 6:1) — o laranja puro nunca vira texto.
  static const orangeText = Color(0xFFA33A00);
  static const live = Color(0xFFC8000F);
  static const pendingText = Color(0xFF7A5A00);
  static const pendingFill = Color(0xFFFFD400);
  static const winText = Color(0xFF00753A);
  static const winFill = Color(0xFF2BD17E);
  static const markEmpty = Color(0xFFD6D6D2);

  /// Texto secundário: preto a 80% sobre branco, sólido (nada abaixo de 66%).
  static const mute = Color(0xFF333333);

  static bool isOn(BuildContext context) =>
      Theme.of(context).extension<MesaSunTheme>() != null;

  /// Tema do Modo Sol a partir do tema atual (preserva tipografia e botões do app).
  static ThemeData themeFrom(ThemeData base) {
    final scheme = AppTheme.light.colorScheme.copyWith(
      surface: white,
      surfaceContainerLowest: white,
      surfaceContainerLow: white,
      surfaceContainer: white,
      surfaceContainerHigh: surface,
      surfaceContainerHighest: white,
      onSurface: ink,
      onSurfaceVariant: mute,
      outline: ink,
    );
    return AppTheme.light.copyWith(
      colorScheme: scheme,
      scaffoldBackgroundColor: white,
      extensions: const [MesaSunTheme()],
    );
  }
}

/// Aplica o Modo Sol na árvore da mesa: tema, cor de texto na raiz e brilho no máximo.
///
/// O brilho é do app (some ao sair da tela ou ao desligar o modo), nunca o do sistema.
class MesaSunScope extends ConsumerStatefulWidget {
  const MesaSunScope({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<MesaSunScope> createState() => _MesaSunScopeState();
}

class _MesaSunScopeState extends ConsumerState<MesaSunScope> {
  bool _brightnessRaised = false;

  Future<void> _syncBrightness(bool sun) async {
    try {
      if (sun) {
        _brightnessRaised = true;
        await ScreenBrightness.instance.setApplicationScreenBrightness(1);
      } else if (_brightnessRaised) {
        _brightnessRaised = false;
        await ScreenBrightness.instance.resetApplicationScreenBrightness();
      }
    } catch (_) {
      // Plataforma sem controle de brilho (ou teste): o tema vale do mesmo jeito.
    }
  }

  @override
  void initState() {
    super.initState();
    ref.listenManual<bool>(
      mesaSunModeProvider,
      (_, sun) => _syncBrightness(sun),
      fireImmediately: true,
    );
  }

  @override
  void dispose() {
    if (_brightnessRaised) {
      try {
        ScreenBrightness.instance.resetApplicationScreenBrightness();
      } catch (_) {}
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sun = ref.watch(mesaSunModeProvider);
    if (!sun) return widget.child;
    final theme = MesaSun.themeFrom(Theme.of(context));
    return Theme(
      data: theme,
      // Toda a tipografia herda o preto do tema, sem depender do tema anterior.
      child: DefaultTextStyle.merge(
        style: const TextStyle(color: MesaSun.ink),
        child: widget.child,
      ),
    );
  }
}

/// Botão ☀ do cabeçalho: liga/desliga o Modo Sol sem sair da tela.
class MesaSunToggleButton extends ConsumerWidget {
  const MesaSunToggleButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sun = ref.watch(mesaSunModeProvider);
    final colors = Theme.of(context).colorScheme;
    return Tooltip(
      message: sun ? 'Desligar modo sol' : 'Modo sol',
      child: Material(
        color: sun ? MesaSun.pendingFill : colors.surfaceContainerHigh,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: sun
              ? const BorderSide(color: MesaSun.ink, width: 2)
              : BorderSide.none,
        ),
        child: InkWell(
          key: const ValueKey('mesa-sun-toggle'),
          onTap: () => ref.read(mesaSunModeProvider.notifier).toggle(),
          borderRadius: BorderRadius.circular(14),
          child: SizedBox(
            width: 44,
            height: 44,
            child: Icon(
              Icons.wb_sunny_rounded,
              size: 22,
              color: sun ? MesaSun.ink : colors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

/// Retângulo arredondado tracejado: o "desabilitado" do Modo Sol, que não pode parecer ativo.
class MesaSunDashedBorder extends CustomPainter {
  const MesaSunDashedBorder({this.radius = 16});

  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = MesaSun.ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Offset.zero & size,
          Radius.circular(radius),
        ).deflate(1),
      );
    for (final metric in path.computeMetrics()) {
      for (double d = 0; d < metric.length; d += 12) {
        canvas.drawPath(metric.extractPath(d, d + 7), paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant MesaSunDashedBorder old) => old.radius != radius;
}
