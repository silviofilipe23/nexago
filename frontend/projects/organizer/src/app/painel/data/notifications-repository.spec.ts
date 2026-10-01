import { notificationPortalUrl } from './notifications-repository';

// O `data.url` das notificações do organizador era rota do portal (`/painel/...`) e o app, que
// recebe o mesmo `data`, abria uma rota inexistente. Agora `url` é a rota do app e o portal lê
// `webUrl` — sem quebrar o que já está gravado no sino com o `url` antigo.
describe('notificationPortalUrl', () => {
  it('prefere o webUrl: o url é a rota do app', () => {
    expect(
      notificationPortalUrl({
        url: '/organizer/tournaments/t1',
        webUrl: '/painel/eventos/t1/inscricoes?registrationId=r1',
      }),
    ).toBe('/painel/eventos/t1/inscricoes?registrationId=r1');
  });

  it('notificação gravada antes (sem webUrl) segue no url', () => {
    expect(notificationPortalUrl({ url: '/painel/eventos/t1/inscricoes' })).toBe(
      '/painel/eventos/t1/inscricoes',
    );
  });

  it('webUrl vazio não esconde o url', () => {
    expect(notificationPortalUrl({ url: '/painel/financeiro', webUrl: '  ' })).toBe('/painel/financeiro');
  });

  it('sem destino nenhum, null', () => {
    expect(notificationPortalUrl(undefined)).toBeNull();
    expect(notificationPortalUrl({})).toBeNull();
  });
});
