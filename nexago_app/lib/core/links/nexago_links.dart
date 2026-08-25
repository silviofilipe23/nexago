/// Bases públicas de link do nexaGO.
///
/// O portal do atleta é o único domínio do projeto que resolve DNS, responde
/// HTTPS e serve os arquivos de associação de Universal/App Link
/// (`.well-known/apple-app-site-association` e `assetlinks.json`). Por isso é
/// dele que saem os links compartilháveis: quem tem o app instalado cai no
/// app, quem não tem cai na web — em vez de cair em lugar nenhum.
///
/// `nexago.app`, que ainda aparece em links antigos pelo código, **não está
/// registrado** — ver `docs/universal-links.md`.
const String kAthletePortalBaseUrl = 'https://atleta.nexago.com.br';
