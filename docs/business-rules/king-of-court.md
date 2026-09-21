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
- **Desafiante erra o saque** → **perde a vez**: volta para o fim da fila e o rei fica no trono,
  mas **ninguém pontua**. O saque errado não é rally ganho pelo rei — tratá-lo assim daria ao rei
  um ponto que o regulamento não dá.
- Quem entra no lado do desafiante saca.

Nos três casos entra o próximo da fila, e ele passa a sacar.

## Fim da rodada
- Por **tempo**, definido pelo organizador (padrão 15 min, faixa de 5 a 40). Pode
  variar por fase — é comum a final ser mais longa que a classificatória.
- O rally em andamento no estouro do cronômetro é concluído antes do encerramento.
- Vence a rodada quem tem mais pontos.

## Desempate

Só importa o empate que **atravessa a linha de classificação**: duas duplas empatadas
em 1º, com duas vagas, passam as duas — não há o que decidir. Todas as duplas na
pontuação da última vaga entram no empate, e com poucos rallies é comum serem três.

1. **Bola de ouro** — rally único entre as empatadas, jogado na areia depois do apito.
   A mesa aponta quem venceu (`kocGoldenPoint`), e o ponto vai para a DUPLA, não para
   um lado: as empatadas quase nunca são o rei e o desafiante do momento.
2. **Critério automático**, quando a mesa opta por não jogar a bola de ouro:
   quem foi rei por último entre as empatadas; persistindo, a ordem de semeadura.

O encerramento é **recusado** com empate na vaga em aberto: a mesa joga a bola de ouro
ou confirma explicitamente o critério automático. A vaga nunca sai calada.

## Estrutura do torneio
- Fases: **Classificatória → Semifinal → Final**. Cada fase roda N rodadas em
  paralelo (uma por quadra).
- Os `qualifiersPerRound` primeiros de cada rodada avançam para a fase seguinte,
  redistribuídos em serpentina pela colocação.
- A **rodada final** define o pódio direto pela tabela: 1º, 2º, 3º, 4º.

## Telão
A rodada é exibida num telão público: trono, cronômetro, tabela ao vivo e fila.
O telão é **por categoria**, não por rodada — segue sozinho a que está valendo
(em andamento → próxima a entrar → última concluída).

## Ranking
A categoria King of the Court **não pontua**: não soma no ranking global, no
ranking da liga nem em XP. O pódio da categoria existe e é registrado; o que não
existe é pontuação. Categorias de duelo do mesmo torneio seguem pontuando.

## Restrições
- Elenco da rodada: mínimo 3, máximo 5 duplas.
- Publicada a chave, o elenco congela (mesma trava de substituição dos outros formatos).
- Toda mutação de placar passa por callable (mesário/staff autorizado); o cliente só lê.
