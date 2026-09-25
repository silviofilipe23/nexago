# King of the Court (KOTC)

## Conceito
Rodada disputada por **3 a 6 duplas na mesma quadra ao mesmo tempo**. Um lado é o
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

1. **Duas empatadas — bola de ouro.** Rally único entre elas, jogado na areia depois
   do apito. A mesa aponta quem venceu (`kocGoldenPoint`), e o ponto vai para a DUPLA,
   não para um lado: as empatadas quase nunca são o rei e o desafiante do momento.
2. **Três ou mais — mini-rodada.** "Rally único" não resolve: um rally tem dois lados.
   As empatadas jogam o PRÓPRIO formato, e a primeira que pontuar leva a vaga.
3. **Critério automático**, quando a mesa opta por não jogar nada: quem foi rei por
   último entre as empatadas; persistindo, a ordem de semeadura.

O encerramento é **recusado** com empate na vaga em aberto: a mesa joga o desempate na
areia ou confirma explicitamente o critério automático. A vaga nunca sai calada.

Na mesa isso aparece antes do clique: com empate aberto o botão de encerrar fica
**desabilitado**, dizendo o que falta ("resolva as 2 vagas primeiro"), e a saída pelo
critério automático vira um botão separado e escrito. Só desabilitar deixaria a rodada
sem saída quando a mesa decide não jogar o desempate — que o regulamento permite.

### Mini-rodada (três ou mais empatadas)

Não é regra nova: é exatamente o que as duplas acabaram de jogar por 15 minutos.

1. Entra no trono a melhor pelo **critério automático** (quem foi rei por último;
   persistindo, a ordem de semeadura). A segunda desafia; as demais esperam na fila.
2. **Rei venceu** → marca o ponto, leva a vaga, acabou.
3. **Desafiante venceu** → assume o trono **sem ponto** e entra a próxima da fila.

Dura de 2 a 4 rallies. A mesa mostra a ordem de entrada e registra UM toque: a dupla
que pontuou. Os rallies intermediários (desafiante que coroa sem pontuar) não vão para
o log — o que decide a vaga é o ponto.

O critério automático deixa de ser um desempate silencioso e vira **vantagem
posicional**: quem foi rei por último precisa de um rally para levar a vaga; as outras
precisam de dois. Premia sem decidir sozinho.

Quando o empate cobre mais de uma vaga, cada mini-rodada resolve **uma**: o empate é
recalculado a cada registro, e o encerramento segue recusado até zerar.

A mesa mostra **quantas vagas o empate decide** antes do primeiro toque — não é o
tamanho do grupo empatado, e sim `qualifiersPerRound` menos as classificadas já
definidas acima dele. Quatro duplas em zero com duas classificando disputam DUAS vagas;
resolvida a primeira, as três restantes disputam UMA. Entre um desempate e o seguinte a
mesa nomeia quem já se classificou, para o mesário saber que o toque anterior valeu.

Um empate de três não é caso raro — **um único rally** num elenco de 4 já deixa as
outras três empatadas em zero.

## Estrutura do torneio
- Fases: **Classificatória → Semifinal → Final**. Cada fase roda N rodadas em
  paralelo (uma por quadra).
- Os `qualifiersPerRound` primeiros de cada rodada avançam para a fase seguinte,
  redistribuídos em serpentina pela colocação.

### Baterias por chave

Por padrão a chave joga **uma** rodada e os `qualifiersPerRound` melhores por pontos
avançam. Com mais de uma bateria, a chave joga N rodadas e **cada uma
classifica uma dupla**:

- A vencedora da rodada classifica e **sai** — libera a quadra.
- A rodada seguinte da mesma chave roda com **as que sobraram** (4 → 3 → …).
- Como toda rodada precisa de 3 duplas, uma chave de S comporta no máximo
  **S − 2** rodadas: uma chave de 4 dá 2, uma de 5 dá 3.

Vale em **qualquer fase**. Cada fase declara as suas baterias no plano
(`phases[].roundsPerBracket`), então uma semifinal de 6 duplas pode rodar 4
baterias e mandar 4 para a final. A final é sempre uma bateria: a tabela dela
é o pódio.

As N classificadas de uma mesma chave caem em rodadas **diferentes** da fase
seguinte, e cada rodada da fase seguinte mistura vencedoras de rodadas de chave
diferentes — senão uma semifinal juntaria todas as que venceram contra a chave
cheia e nasceria muito mais forte que a outra.

**As rodadas de uma chave saem em sequência.** Na areia é o mesmo grupo na
mesma quadra: joga a rodada 1, a vencedora sai, e as que ficaram seguem direto
para a rodada 2. A numeração acompanha (#1 e #2 são a chave C1, #3 e #4 a C2), e
o auto-agendamento só libera a rodada seguinte depois que a anterior termina —
a rodada que nasce só com vagas não tem elenco, então sem essa dependência o
alocador a colocaria no mesmo horário, em outra quadra, com as mesmas duplas.

**A divisão do campo muda junto.** Com uma rodada por chave, 14 duplas em
quadras de 4 viram 4 chaves (4, 4, 3, 3). Pedindo duas rodadas, a chave de 3 não
comportaria a segunda — então o campo é dividido em **menos chaves, cada uma mais
cheia**: 3 chaves de 5, 5, 4. Só é recusado quando nem juntando cabe (6, 7 e 11
duplas: uma chave só passaria do teto de 5 por rodada).

**Custo de quadra.** Com 16 duplas em chaves de 4: uma rodada por chave dá 7
rodadas no total; duas dão 11. O wizard mostra o tempo total antes de publicar.
- A **rodada final** define o pódio direto pela tabela: 1º, 2º, 3º, 4º.

**Campo que cabe numa chave só ignora as baterias.** Quando o campo inteiro
forma uma chave — na prática 3, 4 ou 5 duplas —, o torneio É a rodada final, e
ela vale **uma bateria**, mesmo que a categoria peça 2 ou 3 rodadas por chave.

Isto mudou com o plano de fases (setembro/2026) e é uma mudança declarada, não
um acidente: com 5 duplas, quadras de 4 e 3 rodadas por chave, o gerador antigo
emitia **três rodadas** de 5, 4 e 3 duplas, as três tipadas como final — três
pódios na mesma categoria, incoerente com a regra do próprio formato de que a
final é uma bateria e a tabela dela é o pódio. Hoje sai uma rodada de 5. É o
único desvio de forma que a mudança de gerador produziu; nenhuma configuração
com 6 duplas ou mais gera chave diferente da de antes.

## Telão
A rodada é exibida num telão público: trono, cronômetro, tabela ao vivo e fila.
O telão é **por categoria**, não por rodada — segue sozinho a que está valendo
(em andamento → próxima a entrar → última concluída).

`/telao/{tournamentId}` abre **sem login**, como o telão do sorteio: o link vai
pra smart TV da arena, que não tem onde digitar senha de organizador. Ele lê só
`tournaments`, `matches`, `teams` e `public_profiles` — as quatro já públicas
(`read: if true`). A **configuração** do telão (quais quadras, quais recursos, a
chamada) continua dentro do painel, que é guardado.

## Ranking
A categoria King of the Court **não pontua**: não soma no ranking global, no
ranking da liga nem em XP. O pódio da categoria existe e é registrado; o que não
existe é pontuação. Categorias de duelo do mesmo torneio seguem pontuando.

## Restrições
- Elenco da rodada: mínimo 3, máximo 6 duplas. O teto é **por categoria**
  (`maxTeamsPerRound`, 3 a 6); categoria que não escolheu vale 5, o teto antigo.
  Acima de 5 a fila fica longa — é escolha do organizador, não padrão.
- Publicada a chave, o elenco congela (mesma trava de substituição dos outros formatos).
- Toda mutação de placar passa por callable (mesário/staff autorizado); o cliente só lê.
