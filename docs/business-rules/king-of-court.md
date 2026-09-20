# King of the Court (KOTC)

## Conceito
Rodada disputada por **3 a 5 duplas na mesma quadra ao mesmo tempo**. Um lado é o
**trono** (rei); o outro é o lado do **desafiante**. Só existe um rally por vez, e
**só o rei pontua**.

Não é um duelo: a unidade agendável é a **rodada**, não a partida. Uma rodada não
tem `teamAId`/`teamBId` — tem um elenco (`kocTeamIds`) e uma tabela de pontos.

## Regras do rally
- O desafiante entra, saca e joga um rally contra o rei.
- **Rei vence** → +1 ponto para o rei; o desafiante volta para o fim da fila; entra o próximo.
- **Desafiante vence** → ele cruza para o trono e vira o novo rei (**não pontua pela coroação**);
  o rei destronado vai para o fim da fila.
- Quem entra no lado do desafiante saca.

## Fim da rodada
- Por **tempo** (padrão: 15 min) e/ou por **alvo de pontos**. O rally em andamento
  no estouro do cronômetro é concluído antes do encerramento.
- Vence a rodada quem tem mais pontos.

## Desempate (na ordem)
1. **Bola de ouro** — rally único entre as duplas empatadas (padrão).
2. Quem foi rei por último entre as empatadas.
3. Confronto direto (rallies vencidos entre elas).

## Estrutura do torneio
- Fases: **Classificatória → Semifinal → Final**. Cada fase roda N rodadas em
  paralelo (uma por quadra).
- Os `qualifiersPerRound` primeiros de cada rodada avançam para a fase seguinte,
  redistribuídos em serpentina pela colocação.
- A **rodada final** define o pódio direto pela tabela: 1º, 2º, 3º, 4º.

## Restrições
- Elenco da rodada: mínimo 3, máximo 5 duplas.
- Publicada a chave, o elenco congela (mesma trava de substituição dos outros formatos).
- Toda mutação de placar passa por callable (mesário/staff autorizado); o cliente só lê.
