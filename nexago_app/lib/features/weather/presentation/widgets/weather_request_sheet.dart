import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme_colors.dart';
import '../weather_ui.dart';

/// Folha do pedido "Choveu? Pedir cancelamento sem custo": observação
/// opcional e confirmação. Devolve a observação (vazia = sem observação) ou
/// `null` quando o atleta desiste.
Future<String?> showWeatherRequestSheet(
  BuildContext context, {
  required String arenaName,
  required bool afterStart,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceRaised,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) =>
        WeatherRequestSheet(arenaName: arenaName, afterStart: afterStart),
  );
}

class WeatherRequestSheet extends StatefulWidget {
  const WeatherRequestSheet({
    super.key,
    required this.arenaName,
    required this.afterStart,
  });

  static const Key noteFieldKey = ValueKey('weather-request-note');
  static const Key submitKey = ValueKey('weather-request-submit');

  final String arenaName;
  final bool afterStart;

  @override
  State<WeatherRequestSheet> createState() => _WeatherRequestSheetState();
}

class _WeatherRequestSheetState extends State<WeatherRequestSheet> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: colors.onSurfaceMuted.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              WeatherIconTile(
                size: 40,
                background: WeatherTone.rain.withValues(alpha: 0.16),
                child: WeatherRainIcon(
                  size: 22,
                  strokeWidth: 2,
                  color: WeatherTone.rainText(context),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Pedir cancelamento por chuva',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            widget.afterStart
                ? 'O jogo já começou: se a ${widget.arenaName} aprovar, o tempo '
                    'que faltava vira crédito, sem custo.'
                : 'Se a ${widget.arenaName} aprovar, você remarca ou guarda o '
                    'valor como crédito, sem custo. O horário não fica segurado '
                    'durante a análise.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: colors.onSurfaceMuted,
              height: 1.45,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            key: WeatherRequestSheet.noteFieldKey,
            controller: _note,
            maxLength: 280,
            minLines: 2,
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Observação (opcional)',
              hintText: 'Ex.: quadra alagada, chuva forte desde as 17h',
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            key: WeatherRequestSheet.submitKey,
            onPressed: () => Navigator.of(context).pop(_note.text.trim()),
            child: const Text('Enviar pedido'),
          ),
          const SizedBox(height: 6),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancelar'),
          ),
        ],
      ),
    );
  }
}
