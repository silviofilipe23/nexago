# Fase 2 — Live Activity e Dynamic Island no iOS

Data: 2026-09-08
Branch: `claude/match-tracking-lock-screen-mltu1m`
Antecedente: `2026-09-05-seguir-partida-tela-bloqueada-design.md` (Fase 1, mergeada no #399)

## O que esta fase faz

Trocar, **no iOS**, a linha de alerta que se substitui por um **card vivo** na tela bloqueada e
na Dynamic Island, com o placar atualizando sozinho.

O modelo de "seguir" não muda: mesmo botão, mesma coleção `followedMatches`, mesmo gatilho
`onMatchLiveScoreChanged`, mesmo `resolveLiveUpdate` decidindo o que merece push. **Muda só o
transporte e o desenho no iOS.** O Android continua exatamente como está.

## Aviso: a Fase 1 ainda não foi validada em campo

Nada da Fase 1 foi exercido com push real — sem deploy, sem aparelho. Se o fan-out tiver um
defeito, ele vai aparecer aqui, misturado com código nativo novo. **Rodar a Task 12 da Fase 1
antes desta fase economiza muito tempo de depuração.**

## Decisões tomadas

| | |
|---|---|
| Piso de iOS | **18+**, para usar broadcast channels |
| Transporte das atualizações | **Broadcast channel**, um por partida |
| Como a activity nasce | **Push-to-start** (iOS 17.2+), com o channel ID embutido |

## A assimetria que define a arquitetura

Vale entender antes de ler o resto, porque é contraintuitivo:

- **Atualizar é O(1).** Um broadcast por atualização chega a todos os inscritos no canal. É o
  mesmo ganho do tópico FCM da Fase 1.
- **Começar é O(N).** Push-to-start vai para um **token de aparelho**, não para um canal. Para
  fazer a activity nascer em quem segue, é um push por aparelho seguidor.

A conta fecha a nosso favor: começar acontece **uma vez por partida por seguidor**; atualizar
acontece **dezenas de vezes**. O caro é O(1), o barato é O(N).

**Consequência que a Fase 1 tinha evitado:** para mandar push-to-start é preciso saber **quem
segue a partida**. O desenho por tópico existia justamente para nunca precisar dessa lista. Agora
precisamos — mas só no evento `start`.

Isso exige uma consulta por `matchId` sobre `followedMatches`, que é subcoleção de usuário. Ou
seja: um **segundo índice de collection group**, agora em `matchId`. Alternativa considerada e
descartada: manter um espelho `matchFollowers/{matchId}/users/{uid}` — dobraria escrita no
follow e criaria um segundo lugar para o dado divergir.

## Ciclo de vida

```
partida entra ao vivo
  └─ cria canal APNs  → guarda apnsChannelId no sidecar matchLiveNotify/{matchId}
  └─ lê seguidores    → push-to-start para cada pushToStartToken, com o channelId dentro
       └─ o sistema cria a Live Activity já inscrita no canal

cada atualização aprovada por resolveLiveUpdate
  └─ UM broadcast no canal

partida encerra
  └─ broadcast com event "end" + dismissal-date
  └─ deleta o canal (limite de 10.000 por ambiente — não dá para vazar)
```

O `resolveLiveUpdate`, o throttle de 20s e o sidecar são **reaproveitados inteiros**. A cadência
recomendada pela Apple para Live Activity é 5–15s; nossa janela de 20s já é compatível.

## O que o app precisa ganhar

- **Target novo** `NexagoLiveActivity` (Widget Extension), deployment target **18.0**. O app
  principal fica em iOS 15 (`ios/Podfile:3`, travado pelo `recaptcha_enterprise_flutter`); a
  extension tem alvo próprio e simplesmente não instala abaixo dele.
- **App Group** `group.br.com.nexago.liveactivity`, para app e extension compartilharem estado.
- `NSSupportsLiveActivities: true` no `Info.plist` do Runner — **hoje ausente** (conferido).
  Mais `NSSupportsLiveActivitiesFrequentUpdates` para pedir orçamento maior de atualização.
- `MatchLiveAttributes`: estático (matchId, nomes das duplas, categoria, quadra) +
  `ContentState` (sets vencidos, pontos do set, índice do set, saque, status, `updatedAt`).
- **Primeira ponte nativa do app.** `MethodChannel('br.com.nexago/live_activity')` com
  `isSupported` / `end`, e um `EventChannel` para o **push-to-start token**.
- Token em `users/{uid}/liveActivityTokens/{installationId}` — por APARELHO, não por activity:
  push-to-start é um token só por app por dispositivo.

### `staleDate` não é enfeite

É como esses apps sobrevivem a push perdido: declara-se quando o dado apodrece e o widget
renderiza sozinho um estado "desatualizado" em vez de exibir placar velho como atual. Com a
janela de 20s do throttle, `staleDate = updatedAt + 90s`.

Na volta ao primeiro plano o app relê a partida e chama `activity.update()` com a verdade do
Firestore, sem esperar o próximo push.

## Limites da plataforma, para não prometer o que não dá

- **8h** de atualizações ativas, até **12h** na tela bloqueada. Irrelevante para uma partida;
  relevante no dia em que alguém seguir uma etapa inteira.
- Payload de **4 KB**.
- **10.000 canais** por ambiente — daí deletar o canal no fim ser obrigatório, não higiene.
- Abaixo de iOS 18 **não há Live Activity nesta entrega**. Esses aparelhos continuam recebendo o
  alerta com `collapse-id` da Fase 1, que segue funcionando e não deve ser removido.

## Pré-requisitos manuais (fora do código)

1. **Chave APNs `.p8`** no Firebase/projeto dev — já marcada como pendente em
   `docs/ios-push-notifications-setup.md`. Sem ela nada chega no iOS, nem na Fase 1.
2. **Broadcast Capability** habilitada no App ID, no Apple Developer Portal. É um passo separado
   do push comum.
3. Provisioning profile regenerado depois de (2).

## Incerteza declarada: os detalhes de fio do APNs

A arquitetura acima está firme. **Os detalhes exatos do protocolo não pude confirmar** deste
ambiente — a documentação da Apple é SPA e não renderiza no fetch, e as fontes de terceiros
estavam bloqueadas pelo proxy de rede.

O que ficou **confirmado** pela busca:

- Hosts de gestão de canal: `api-manage-broadcast.sandbox.push.apple.com:2195` (dev) e
  `api-manage-broadcast.push.apple.com:2196` (produção).
- Mesma autenticação do APNs comum (JWT com a `.p8`).
- Limite de 10.000 canais por ambiente; payload de 4 KB; cadência 5–15s.

O que ficou **não confirmado** e precisa ser checado contra a doc antes do deploy:

- Método, path e corpo exatos do *create channel*, e em qual header o channel ID volta.
- Path exato do envio de broadcast e o conjunto completo de headers.
- Forma exata do payload de push-to-start com channel ID embutido.

**Consequência de projeto:** todo detalhe de fio vive num único bloco de constantes
(`APNS_WIRE`), com link para a doc e um comentário exigindo conferência. Nenhum path espalhado
pelo código. A primeira tarefa do plano é confirmar esse bloco — não escrever cliente em cima de
endpoint adivinhado, que é exatamente o tipo de erro que só aparece às 2h da manhã de um sábado
de torneio.

## Fora de escopo

- Live Activity no **Android** (o `ProgressStyle`/`MetricStyle` do Android 16 é outra fase).
- Remover o caminho da Fase 1 no iOS — ele continua servindo iOS < 18.
- Auto-seguir, seguir torneio inteiro, amistosos.
- Widget de home screen.

## Testes

**O que dá para testar automatizado:**
- Núcleos puros do cliente APNs: montagem do JWT, escolha de host por ambiente, montagem de
  headers e payload — tudo em `node:test`, sem rede.
- Decisão de quando criar/deletar canal, a partir do `LiveUpdateDecision` que já existe.
- Núcleo Dart do mapeamento `data` → `ContentState`.

**O que só o aparelho valida:**
- A activity nascer por push-to-start com o app fechado.
- O card atualizar sem reabrir o app.
- Dynamic Island nas três formas (compacta, mínima, expandida).
- `staleDate` degradando o visual quando o push não chega.
- O fim derrubando o card.

**Simulador não serve** para nada disso: sem APNs, não há token nem entrega. Ver a conversa da
Fase 1 — o próprio `pubspec.yaml:72` já registra que o Simulador nunca recebe push.
