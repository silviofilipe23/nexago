import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

/// Erro do servidor sinalizando que a chave já tem partidas jogadas
/// (regenerar apagaria resultados). Disparado por `generateCategoryBracket`.
bool isBracketHasResultsError(Object error) {
  if (error is! FirebaseFunctionsException) return false;
  final details = error.details;
  if (details is Map && details['reason'] == 'bracket_has_results') {
    return true;
  }
  return error.code == 'failed-precondition' &&
      (error.message?.contains('partidas em andamento') ?? false);
}

/// Confirma a regeração destrutiva da chave (apaga partidas/resultados atuais).
Future<bool> confirmRegenerateBracket(BuildContext context) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Regerar a chave?'),
      content: const Text(
        'Esta categoria já tem partidas em andamento ou concluídas. '
        'Regerar vai APAGAR as partidas e os resultados atuais e montar '
        'uma chave nova. Esta ação não pode ser desfeita.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancelar'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text('Apagar e regerar'),
        ),
      ],
    ),
  );
  return result ?? false;
}
