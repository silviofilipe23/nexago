# nexaGO+ — plano pago do atleta (retenção)

**Data:** 03/11/2026 · **Status:** proposta · **Nome:** provisório

## Objetivo

Fazer o atleta que já joga **jogar mais pelo nexaGO** — concentrar inscrições e reservas aqui,
abrir o app toda semana e não ir embora na entressafra. A receita da assinatura é consequência;
o indicador que manda é a frequência do assinante.

O plano aprofunda a retenção de quem **já é ativo**. Não resgata o atleta casual: para esse, os
laços gratuitos (Liga com temporadas, Bora Jogar, push de "torneio do seu nível perto de você")
continuam sendo a alavanca.

## O que o plano nunca vende

- **Vantagem competitiva:** pontos, nível, Elo, sand rank, posição na chave, cabeça de chave,
  sorteio. Se dá pra comprar, o ranking deixa de valer para todo mundo.
- **O básico:** inscrever, reservar, ver chave, placar, Focus, perfil. O organizador depende de
  atleta; piorar o grátis encolhe a rede.

## Pacote (um plano só, para começar)

| Pilar | Benefício | Por que retém | Base que já existe |
|---|---|---|---|
| Economia | Taxa de serviço do atleta zerada **na inscrição**, até um teto mensal | Concentra o gasto no nexaGO ("já pago, vou usar") | Motor de perks do Squad (`squadPerkUses`, nexaGO banca, organizador recebe o mesmo líquido) |
| Evolução | "Seu mês no nexaGO": evolução do rating, aproveitamento por fase, com quem mais vence, metas | Valor sentido todo mês, mesmo jogando pouco | `ratingEvents`, partidas públicas, gráfico "Sua evolução" (#977) |
| Status | Selo/moldura de assinante, cards de compartilhar exclusivos | Identidade + divulgação orgânica | Moldura do sand rank, share cards |
| Prioridade | Inscrição antecipada (24h) **só se o organizador ligar**; +1 escudo de sequência/mês | Medo de perder vaga sem tirar vaga de ninguém | Escudo do sand rank (perk Protetor de Sequência) |

**O que saiu do pacote da v1, e por quê** (conferido no código em 03/11/2026):
- **"Taxa zerada nas reservas":** o atleta não paga taxa de serviço na reserva. O
  `serviceFeeReais` "só existe na inscrição" (`payment_service.dart`); na reserva, a taxa da nexaGO
  sai da arena. Zerar isso não economiza nada para o atleta.
- **Cashback dobrado (4%):** o ganho é `min(% do pago, 50% da taxa da nexaGO)`
  (`computeEarnCents` em `cashback-rules.ts`). Com a taxa do atleta zerada, o teto encolhe, e se a
  taxa do torneio era toda do atleta ele vira **zero**. Ou seja, "taxa zerada + 4%" não convivem nas
  regras de hoje; o 4% precisaria de um teto próprio, pago pela nexaGO. Fica de fora da v1: uma
  alavanca de economia só, fácil de explicar e de contar.
- **Prioridade na fila do clubinho:** não existe fila. Clubinho lotado recusa
  (`arena-club-join.ts`). Só volta ao pacote se a lista de espera do clubinho for construída.

**Contador de economia** na tela do plano e em push mensal ("você economizou R$ X este mês; o
plano custou R$ Y"). É o principal anti-cancelamento.

**Pausar em vez de cancelar** (lesão, entressafra, viagem): 1 a 3 meses por vez, com teto de
**3 meses a cada 12**. Sem teto, quem joga por temporada pausa toda entressafra e paga só quando
joga. Sem cobrança e sem benefício durante a pausa; volta sozinho, com aviso 3 dias antes. No anual,
a pausa empurra a data de renovação.

## Preço

Não fixado. Calibrar com dado real, porque a taxa de serviço é configurável por torneio
(`feeRule`, "quem paga"):

1. Distribuição da taxa de serviço paga pelo atleta ativo por mês, **só em inscrições** (é o único
   lugar onde o atleta paga taxa).
2. **Teto mensal da isenção** ≈ preço do plano. Sem teto, o assinante que joga muito custa mais
   do que paga, e a frequência maior não devolve a diferença: a inscrição extra do assinante também
   sai sem taxa do atleta.
3. A conta fecha com: assinatura + a parte da taxa da nexaGO que é do **organizador/arena** nas
   inscrições e reservas a mais que o assinante faz + quem usa pouco.
4. Anual com ~2 meses grátis (mesmo desenho do plano da arena).
5. A faixa de preço que a lista de espera responder (Fase 0) entra nessa conta.

> Correção de 03/11/2026: a versão anterior dizia "preço entre 40% e 60% da taxa mediana, com
> isenção total". Com isenção total, o assinante mediano devolveria só metade do que deixa de
> pagar, e a frequência maior não compensa porque a inscrição dele continua sem taxa. Daí o teto.

**Margem do plano** = assinaturas + taxa do lado do organizador/arena das atividades **a mais**
− taxa do atleta renunciada − custo de cobrança.

## Regras de convivência

- **Squad:** embaixador já tem desconto/inscrição grátis por contrato. Vale o **maior** benefício
  por cobrança, nunca a soma.
- **Organizador:** recebe sempre o mesmo líquido (a nexaGO banca, como no Squad e no cashback).
  Inscrição antecipada é opção do torneio, desligada por padrão.
- **Inscrição antecipada:** na janela de 24h, cada categoria aceita no máximo **metade das vagas,
  arredondada para baixo**; o resto fica para a abertura geral, e vaga antecipada não usada também
  vai para a abertura geral. A dupla entra na janela se **quem inscreve** for assinante.
- **Ranking/nível/chave:** nenhuma regra olha para o plano. A ordem de inscrição não muda sorteio,
  potes nem cabeças de chave (quem define potes e cabeças é o organizador, em `draw-entrants.ts`).
- **Cashback durante a pausa:** segue a regra de todo mundo, 6 meses por lote. **Não congela.** O
  cashback de 2% é programa de todos os atletas, com regulamento próprio; congelar por estado do plano
  criaria uma segunda regra de vencimento e um motivo para pausar só para guardar saldo. Na folha de
  pausa, mostrar o que vence durante a pausa ("R$ X vencem em 12 dez; use antes") com atalho para usar.

## Riscos a resolver antes do MVP

- **Lojas (Apple/Google):** assinatura que libera recurso digital no app (relatório, selo) pode
  exigir a compra pela loja (15–30%). Benefício sobre serviço físico (quadra, torneio) costuma
  ficar fora. Validar a regra vigente no Brasil antes de fechar o pacote; alternativa é vender
  só pelo portal web e o app apenas reconhecer a assinatura.
- **Viés de medida:** quem assina já era engajado. Medir frequência **antes × depois** da
  assinatura do mesmo atleta, ou manter grupo de controle.
- **Canibalização da taxa:** coberta pelo teto mensal da isenção e pela margem acompanhada mês a mês.
- **Cartão salvo:** o atleta não tem forma de pagamento salva hoje (C6 das Cobranças, sem backend).
  A tela de assinar depende disso ou de um checkout hospedado; e, no iOS, é justamente a tela que
  esbarra na regra da loja.

## Protótipo (`NexaGO Atleta - nexaGO+.html`, 03/11/2026)

9 telas: P0 pagamento da inscrição com oferta, P1 tela do plano, P2 assinar, P3 meu plano,
P4 seu mês, P5 torneio com inscrição antecipada, P6 perfil, P7 push do dia 1º, P8 pausa.

Ajustes para o protótipo bater com a spec e com o sistema:
- **P0, P1, P3, P7:** tirar "taxa de serviço · reservas" e "cashback extra 4%". A economia é só a
  taxa da inscrição, até o teto.
- **P2:** "Começa a valer agora" sem "Cashback 4%"; forma de pagamento depende do item de cartão salvo.
- **P5:** os contadores passam da metade (9/8 na Mista C, 11/8 na Mista B), o que contradiz a regra
  da própria tela. Tirar a linha "Cashback 4%". Trocar "Sorteio e seeding seguem o rating de todos"
  por "A ordem de inscrição não muda sorteio, potes nem cabeças de chave".
- **P3:** benefício "Fila do clubinho" sai.
- **P8:** "o cashback não expira" vira "seu saldo continua valendo até o vencimento", mais o aviso do
  que vence durante a pausa. Teto de 3 meses a cada 12.
- **Datas:** 1º/nov/2026 e 15/nov/2026 são domingo (as telas dizem sábado); 06–07/dez é domingo e segunda.
- **Valores:** preço R$ 19,90 e taxas são ilustrativos, até a calibração da seção Preço.

## Fases

### Fase 0 — Lista de espera (este PR)

Porta falsa honesta: mede interesse antes de construir cobrança.

- Card na Início, abaixo de Novidades, só com `appConfig/athletePlus.waitlistEnabled == true`
  (doc ausente = some). Abre uma folha com os 4 pilares **sem números prometidos** e um aviso
  de que benefícios e preço estão em definição.
- Na folha, opcionais: "o que mais te interessa" (multi) e "quanto faz sentido pagar por mês"
  (faixas). Botão "Quero ser avisado". "Agora não" no card dispensa.
- Grava `athletePlusWaitlist/{uid}`:
  `{status: 'joined'|'dismissed', source, interests[], priceBand?, createdAt, updatedAt}`.
  Gravação única (só create; quem dispensou não vê mais o card). Rules: o atleta cria e lê só o
  próprio doc; ninguém lista; nada de update/delete pelo cliente.
- Analytics: `athlete_plus_card_shown` (1×/sessão), `athlete_plus_sheet_opened`,
  `athlete_plus_waitlist_joined` (`interests`, `price_band`), `athlete_plus_card_dismissed`.
- Relatório: `functions/scripts/athlete-plus-waitlist-report.js` (Admin SDK) conta inscritos,
  dispensas, interesses e faixas de preço. Flag por `set-athlete-plus-flag.js`.

**Critério para seguir para a Fase 1:** taxa de "Quero ser avisado" sobre cards exibidos e a faixa
de preço mediana compatível com a conta de margem. Sugestão de corte: ≥ 8% dos atletas que viram
o card entram na lista.

### Fase 1 — MVP pago

Assinatura recorrente no Asaas (mesma base dos planos de arena e de horário), isenção da taxa da
inscrição até o teto via motor de perks, selo, contador de economia, pausa. Quem está na lista
recebe o convite primeiro (push).

### Fase 2 — Evolução

Relatório "Seu mês no nexaGO" + push mensal; inscrição antecipada opcional por torneio.

### Fase 3 — Parceiros

Vouchers de marcas (`rankPartnerVouchers`), desconto na Loja.

## Métricas

- % dos atletas ativos (30d) que assinam.
- Frequência mensal (inscrições + reservas + clubinho) antes × depois da assinatura.
- Churn mensal (meta < 5%); pausas e retornos.
- Economia média percebida × preço.
- Margem do plano (fórmula acima).
