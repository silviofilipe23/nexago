import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/koc/koc_round_providers.dart';
import 'public_koc_round_page.dart';

/// Telão da categoria King of the Court.
///
/// Diferente do telão por rodada, este SEGUE a rodada que está valendo. É o que
/// a operação real exige: numa quadra só, as sete rodadas da etapa acontecem em
/// sequência, e um link por rodada obrigaria alguém a trocar a tela sete vezes
/// durante o dia, na frente do público.
///
/// Abre-se uma vez de manhã e ele acompanha até a final.
class PublicKocBoardPage extends ConsumerWidget {
  const PublicKocBoardPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matchIdAsync = ref.watch(
      kocLiveRoundIdProvider((
        tournamentId: tournamentId,
        categoryId: categoryId,
      )),
    );

    return Scaffold(
      backgroundColor: Colors.black,
      body: matchIdAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: Colors.white)),
        ),
        data: (matchId) {
          if (matchId == null || matchId.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'Rodadas ainda não publicadas nesta categoria',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 26),
                ),
              ),
            );
          }
          // `key` troca junto com a rodada: sem ela o telão manteria o estado
          // da rodada anterior (relógio, tabela) ao virar de fase.
          return PublicKocRoundPage(key: ValueKey(matchId), matchId: matchId);
        },
      ),
    );
  }
}
