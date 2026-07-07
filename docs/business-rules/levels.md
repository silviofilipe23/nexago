# Nível

## Conceito
"Nível" é diferente de [ranking](ranking.md): não é sobre colocação em torneios, é sobre a **força do atleta**, usada para decidir em quais categorias ele pode se inscrever (anti-sandbagging). Existem duas camadas, hoje coexistindo:

- **Nível declarado** — escolhido pelo próprio atleta no app, só pode subir. É o que vale hoje para elegibilidade de categoria.
- **Rating automático (Glicko-2)** — calculado a partir dos resultados reais em partida, por esporte. Já roda e calcula tudo em produção, mas a promoção/rebaixamento automáticos ainda dependem de flags de rollout (ver seção própria).

Escada unificada (vôlei, hoje): `Iniciante 1 < Iniciante 2 < Intermediário 1 < Intermediário 2 < Open`.

## Nível declarado — regra "só sobe"
- O atleta pode subir de nível a qualquer momento, com confirmação explícita ("o nível só pode subir; para reduzir, fale com o suporte").
- Nunca pode descer sozinho — downgrade é operação de suporte/super admin.
- Independente por esporte (`sportOnboarding.levelsBySport`); esportes sem esporte específico caem no nível global do perfil.
- Aplicado em 3 camadas, para não depender só da UI: tela "Esportes e níveis" bloqueia visualmente níveis abaixo do salvo; a lógica do app rejeita a troca; as regras do Firestore (`athleteLevelsNotDowngraded`) recusam o update inteiro do documento do usuário se qualquer nível regredir.
- **Por quê**: sem o ratchet, o atleta rebaixava o próprio nível na véspera de uma inscrição pra caber numa categoria mais fácil — furava o anti-sandbagging.

## Elegibilidade de categoria (o que o nível decide)
- Um atleta só pode disputar a própria categoria ou categorias **acima** do seu nível, nunca abaixo.
- Numa dupla, vale o nível do integrante **mais forte** — a dupla toda fica restrita pelo nível dele.
- Categoria sem nível definido (ou "Open") aceita qualquer nível.

## Rating automático (escada Glicko-2)
- Um rating por atleta **por esporte** (vôlei de praia e vôlei de quadra têm ratings independentes hoje; beach tennis ainda não tem escada própria — sem volume de torneios ainda).
- 5 degraus no vôlei: Iniciante 1 (rating inicial 1250) → Iniciante 2 (1450, promove ≥1570, rebaixa ≤1350) → Intermediário 1 (1600, promove ≥1720, rebaixa ≤1500) → Intermediário 2 (1750, promove ≥1870, rebaixa ≤1650) → Open (1900, rebaixa ≤1800, topo — sem promoção acima).
- Toda partida concluída (exceto W.O.) atualiza o rating do atleta com base no rating composto da dupla adversária. W.O. conta para o ranking de pontos, mas não altera rating.
- Só decide promover/rebaixar quando o atleta já tem pelo menos **10 partidas rateadas** e o grau de incerteza do rating (RD) está baixo o bastante — evita decisão em cima de poucos jogos.
- **Promoção**: ao cruzar o rating de acesso do degrau, o atleta ganha **120 dias de proteção** contra rebaixamento (mesmo que o rating caia logo depois).
- **Rebaixamento**: não é imediato. Ao cruzar o piso do degrau, o atleta entra em **90 dias de observação**; só rebaixa de fato se, ao fim da janela, tiver pelo menos 6 partidas rateadas nesse período e continuar no piso ou abaixo. Recuperando o rating (piso + margem) a qualquer momento, volta a "estável" sem penalidade.
- **Inatividade nunca rebaixa sozinha** — só aumenta a incerteza (RD) do rating, o que bloqueia novas decisões até o atleta voltar a jogar.
- Correção de um resultado de partida já processado reprocessa (replay) todo o histórico de rating do atleta envolvido, do zero.
- Hoje a engine calcula e audita tudo (`athleteRatings`, `levelHistory`), mas aplicar de fato a promoção/rebaixamento e disparar notificação depende de flags de rollout guardadas em config (`ratingLadders/{esporte}` no Firestore, editável sem deploy) — checar o doc de config para saber o estado vigente em produção.

## Nível declarado × rating automático
- Se o atleta sobe o nível manualmente, a subida é detectada automaticamente e o rating daquele esporte é realinhado para não ficar defasado (nunca abaixo do rating inicial do novo degrau), com o mesmo período de proteção de 120 dias — evita que a engine "rebaixe de volta" logo em seguida.
- Toda mudança de nível (subida manual, promoção automática, rebaixamento automático, migração de dados) fica registrada no histórico do atleta, com o motivo.

## O que o atleta vê no app
- Em "Esportes e níveis": nível atual por esporte; níveis abaixo do salvo aparecem bloqueados; tentar subir pede confirmação.
- Card de "zona" (só aparece quando a engine já tem dado suficiente para o esporte): estável, zona de acesso (perto de promover), zona de reclassificação, ou "consolidando" (ainda com menos de 10 partidas rateadas).

## Regras
- Nível nunca desce por ação do próprio atleta.
- Elegibilidade de categoria usa sempre o nível mais alto entre os integrantes da dupla.
- Nível e rating são sempre por esporte — não existe um valor único cruzando esportes diferentes.
- Beach tennis ainda usa só o nível declarado, sem escada de rating automática.
