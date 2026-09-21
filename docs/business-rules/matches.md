# Partidas

## Estados
- Agendada
- Em Andamento
- Finalizada
- Cancelada

## Regras
- Toda partida deve possuir vencedor.
- Resultado deve ser auditável.

## Saque
- O saque é de uma DUPLA (`servingTeamId`) e de um ATLETA dentro dela (`servingPlayerSlot`,
  posição 1 ou 2 da dupla).
- A dupla declara a ordem de saque dela a cada set. Enquanto a mesma dupla segue sacando é
  sempre o mesmo atleta; quando o saque volta pra ela, vai à linha o PARCEIRO de quem sacou por
  último.
- Virou o set, tudo é declarado de novo: a mesa pergunta quem começa sacando e, quando cada
  dupla estreia no saque daquele set, qual atleta abre.
- A mesa tem "Trocar saque" (troca a dupla) e "Trocar sacador" (troca o atleta) pro conserto na
  mão — o desfazer não reconstrói a ordem de saque.

## Tempo médico
- Atendimento de 5 minutos a um atleta contundido. Diferente do tempo técnico (1 minuto,
  2 por set, tático), ele PARA a partida: com um atendimento em andamento nenhuma mesa marca
  ponto.
- Cota de 1 por ATLETA na partida — não por set e não por dupla. Chamado é chamado: encerrar
  antes dos 5 minutos não devolve a cota.
- Fica no doc da partida, então as três mesas e o telão mostram juntos quem está sendo
  atendido e a mesma contagem.
- Quem encerra é a mesa, não o relógio: chegando a zero o aviso continua no ar até o mesário
  encerrar.
