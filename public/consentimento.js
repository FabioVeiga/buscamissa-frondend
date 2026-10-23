/*
 * Banner de cookies (LGPD) — vanilla-cookieconsent, fora do Angular.
 *
 * Por que aqui e não no ConsentService: o banner é o maior elemento da tela no
 * mobile e vira o LCP. Aberto pelo Angular, ele só aparecia depois da hidratação
 * (Rio, 478 cards: LCP de laboratório 8,9 s, com o conteúdo pintado em 1,4 s).
 * Carregado como script async no <head>, ele pinta junto com o conteúdo.
 *
 * O Angular (ConsentService) continua responsável por registrar a prova de
 * consentimento no backend: as decisões entram na fila window.__bmConsentFila e
 * o evento "bm-consentimento" avisa o serviço.
 */
(function () {
  var w = window;
  w.__bmConsentFila = w.__bmConsentFila || [];

  function aplicar() {
    var cc = w.CookieConsent;
    if (!cc) return;
    var analitico = cc.acceptedCategory('analytics');
    if (w.gtag) w.gtag('consent', 'update', { analytics_storage: analitico ? 'granted' : 'denied' });
    if (analitico) {
      if (w.__bmIniciarClarity) w.__bmIniciarClarity();
    } else if (w.clarity) {
      w.clarity('consent', false);
    }
  }

  function registrar(cookie, tipo) {
    w.__bmConsentFila.push({ cookie: cookie, tipo: tipo });
    w.dispatchEvent(new Event('bm-consentimento'));
  }

  var TEXTOS = {
    consentModal: {
      title: 'Sua privacidade importa',
      description:
        'Usamos cookies necessários para o site funcionar e, com a sua permissão, cookies de análise para entender como o BuscaMissa é usado e melhorá-lo. Você pode aceitar, recusar ou escolher quais categorias permitir. Saiba mais na <a href="/cookies">Política de Cookies</a>.',
      acceptAllBtn: 'Aceitar todos',
      acceptNecessaryBtn: 'Recusar não essenciais',
      showPreferencesBtn: 'Escolher cookies',
    },
    preferencesModal: {
      title: 'Preferências de cookies',
      acceptAllBtn: 'Aceitar todos',
      acceptNecessaryBtn: 'Recusar não essenciais',
      savePreferencesBtn: 'Salvar minhas escolhas',
      closeIconLabel: 'Fechar',
      sections: [
        {
          title: 'Como usamos cookies',
          description:
            'Cookies são pequenos arquivos guardados no seu dispositivo. Você pode escolher o que permitir e mudar de ideia a qualquer momento. Detalhes na <a href="/cookies">Política de Cookies</a>.',
        },
        {
          title: 'Estritamente necessários',
          description:
            'Garantem o funcionamento do site e guardam a sua escolha de cookies. Não podem ser desativados.',
          linkedCategory: 'necessary',
          cookieTable: {
            caption: 'Cookies necessários',
            headers: { name: 'Nome', desc: 'Finalidade', exp: 'Validade' },
            body: [{ name: 'bm_consent', desc: 'Guarda a sua escolha de cookies.', exp: '12 meses' }],
          },
        },
        {
          title: 'Análise e desempenho',
          description:
            'Nos ajudam a entender quais páginas são mais usadas e onde o site pode melhorar (Google Analytics e Microsoft Clarity). Só são ativados se você permitir.',
          linkedCategory: 'analytics',
          cookieTable: {
            caption: 'Cookies de análise',
            headers: { name: 'Nome', domain: 'Serviço', desc: 'Finalidade', exp: 'Validade' },
            body: [
              { name: '_ga, _ga_*', domain: 'Google Analytics', desc: 'Distingue visitantes e sessões para estatísticas de uso.', exp: 'até 2 anos' },
              { name: '_clck, _clsk, CLID', domain: 'Microsoft Clarity', desc: 'Identifica a sessão para análise de uso e mapas de calor.', exp: 'até 1 ano' },
            ],
          },
        },
      ],
    },
  };

  function iniciar() {
    w.CookieConsent.run({
      mode: 'opt-in',
      revision: 1,
      autoClearCookies: true,
      hideFromBots: true,
      cookie: { name: 'bm_consent', expiresAfterDays: 365, sameSite: 'Lax' },
      guiOptions: {
        consentModal: { layout: 'box inline', position: 'bottom left', equalWeightButtons: true, flipButtons: false },
        preferencesModal: { layout: 'box', equalWeightButtons: true, flipButtons: false },
      },
      categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: {
          autoClear: {
            cookies: [
              { name: /^_ga/ },
              { name: '_gid' },
              { name: '_clck' },
              { name: '_clsk' },
              { name: 'CLID' },
              { name: 'MUID' },
              { name: 'SM' },
              { name: 'ANONCHK' },
            ],
          },
        },
      },
      // onConsent roda também a cada carga com consentimento já dado; só registramos
      // decisões novas (primeira escolha e alterações), via onFirstConsent/onChange.
      onConsent: aplicar,
      onFirstConsent: function (e) { registrar(e.cookie, 'primeira'); },
      // onConsent não roda numa alteração: sem aplicar aqui, ligar "análise" pelas
      // preferências só valia depois de recarregar.
      onChange: function (e) { aplicar(); registrar(e.cookie, 'alterou'); },
      language: { default: 'pt-BR', translations: { 'pt-BR': TEXTOS } },
    }).then(function () {
      aplicar();
      w.__bmConsentPronto = true;
      w.dispatchEvent(new Event('bm-consent-pronto'));
    });
  }

  // O banner é anexado ao <body>: se este script chegar com o parser ainda no
  // <head>, espera o <body> existir (um frame basta).
  function quandoHouverBody(fn) {
    if (document.body) fn();
    else requestAnimationFrame(function () { quandoHouverBody(fn); });
  }

  // O UMD vem pré-carregado pelo <link rel="preload"> do index.html, em paralelo
  // com este arquivo: a tag abaixo sai do cache, sem uma ida extra à rede.
  var s = document.createElement('script');
  s.src = '/vendor/cookieconsent.umd.js';
  s.onload = function () { quandoHouverBody(iniciar); };
  document.head.appendChild(s);
})();
