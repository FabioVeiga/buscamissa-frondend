import { Routes } from "@angular/router";
import { LayoutHomeComponent } from "./core/layout/home/layout/layout.component";
import { featureToggleGuard } from "./core/guards/feature-toggle.guard";

export const routes: Routes = [
  {
    path: "",
    component: LayoutHomeComponent,
    children: [
      {
        path: "home",
        data: {
          title: 'BuscaMissa | Encontre missas perto de você',
          description: 'Busque missas e igrejas católicas perto de você por estado, cidade e bairro. Encontre horários e cadastre novas paróquias.',
          canonical: 'https://buscamissa.com.br/home',
        },
        loadComponent: () =>
          import("./modules/public/home/home.component").then(
            (m) => m.HomeComponent
          ),
      },
      {
        path: "buscar",
        data: {
          resultsMode: true,
          title: 'Resultados da busca | BuscaMissa',
          description: 'Resultados da busca de missas e igrejas católicas por estado, cidade e bairro.',
        },
        loadComponent: () =>
          import("./modules/public/home/home.component").then(
            (m) => m.HomeComponent
          ),
      },
      {
        path: "nova",
        canActivate: [featureToggleGuard],
        data: {
          title: 'Cadastrar Igreja | BuscaMissa',
          description: 'Cadastre sua paróquia ou comunidade católica no BuscaMissa e ajude fiéis a encontrarem missas perto deles.',
          canonical: 'https://buscamissa.com.br/nova',
          featureToggleKey: 'cadastro-igreja-site',
        },
        loadComponent: () =>
          import(
            "./modules/public/church/pages/church-registration-page/church-registration-page.component"
          ).then((m) => m.ChurchRegistrationPageComponent),
      },
      {
        path: "editar/:id",
        canActivate: [featureToggleGuard],
        data: {
          title: 'Editar Igreja | BuscaMissa',
          description: 'Atualize as informações da sua paróquia ou comunidade católica no BuscaMissa.',
          featureToggleKey: 'cadastro-igreja-site',
        },
        loadComponent: () =>
          import(
            "./modules/public/church/pages/church-edit-page/church-edit-page.component"
          ).then((m) => m.ChurchEditPageComponent),
      },
      {
        path: "igrejas/:nomeUnico",
        data: {
          title: 'Detalhes da Igreja | BuscaMissa',
          description: 'Veja os horários de missa, endereço e contato desta paróquia ou comunidade católica.',
        },
        loadComponent: () =>
          import("./modules/public/home/details/details.component").then(
            (m) => m.DetailsComponent
          ),
      },
      // Página de cidade (SEO): /missas/sp/sao-jose-dos-campos
      {
        path: "missas/:uf/:cidade",
        data: {
          title: 'Horários de Missa | BuscaMissa',
          description: 'Encontre horários de missa nesta cidade. Paróquias, endereços e horários atualizados.',
        },
        loadComponent: () =>
          import("./modules/public/home/city/city.component").then(
            (m) => m.CityComponent
          ),
      },
      // Paróquia (URL canônica): /paroquia/sp/sao-jose-dos-campos/paroquia-sao-joao-bosco
      {
        path: "paroquia/:uf/:cidade/:slug",
        data: {
          title: 'Detalhes da Igreja | BuscaMissa',
          description: 'Veja os horários de missa, endereço e contato desta paróquia ou comunidade católica.',
        },
        loadComponent: () =>
          import("./modules/public/home/details/details.component").then(
            (m) => m.DetailsComponent
          ),
      },
      {
        path: 'como-funciona',
        data: {
          title: 'Como funciona | BuscaMissa',
          description: 'Entenda como o BuscaMissa reúne horários de missas católicas de centenas de paróquias e como você pode contribuir.',
          canonical: 'https://buscamissa.com.br/como-funciona',
        },
        loadComponent: () =>
          import('./modules/public/como-funciona/como-funciona.component').then(
            (m) => m.ComoFuncionaComponent
          ),
      },
      // Missa Agora — geoloc em tempo real
      {
        path: 'missa-agora',
        data: {
          title: 'Missa Agora | BuscaMissa',
          description: 'Missas acontecendo agora ou nas próximas 2 horas perto de você.',
          canonical: 'https://buscamissa.com.br/missa-agora',
        },
        loadComponent: () =>
          import('./modules/public/missa-agora/missa-agora.component').then(
            (m) => m.MissaAgoraComponent
          ),
      },
      // Minhas Igrejas — favoritos salvos
      {
        path: 'minhas-igrejas',
        data: {
          title: 'Minhas Igrejas | BuscaMissa',
          description: 'Veja todas as suas igrejas favoritas e horários de missa.',
          canonical: 'https://buscamissa.com.br/minhas-igrejas',
        },
        loadComponent: () =>
          import('./modules/public/minhas-igrejas/minhas-igrejas.component').then(
            (m) => m.MinhasIgrejasComponent
          ),
      },
      // Página de todas as cidades
      {
        path: 'cidades',
        data: {
          title: 'Todas as cidades | BuscaMissa',
          description: 'Encontre horários de missa em qualquer cidade do Brasil. Paróquias e comunidades católicas por estado.',
          canonical: 'https://buscamissa.com.br/cidades',
        },
        loadComponent: () =>
          import('./modules/public/cidades/cidades.component').then(
            (m) => m.CidadesComponent
          ),
      },
      // Rota legada do Google Maps — redireciona para a cidade via ViaCEP
      {
        path: "detalhes/:cep",
        loadComponent: () =>
          import("./modules/public/cep-redirect/cep-redirect.component").then(
            (m) => m.CepRedirectComponent
          ),
      },
      {
        path: "enviar-codigo/:controleId",
        data: {
          title: 'Confirmar Cadastro | BuscaMissa',
          description: 'Confirme o cadastro da sua igreja inserindo o código recebido por e-mail.',
        },
        loadComponent: () =>
          import(
            "./modules/public/register-church/send-code/send-code.component"
          ).then((m) => m.SendCodeComponent),
      },
      {
        path: "validar",
        data: {
          title: 'Confirmação de Cadastro | BuscaMissa',
          description: 'Confirme seu cadastro inserindo o código de verificação recebido por e-mail.',
          canonical: 'https://buscamissa.com.br/validar',
        },
        loadComponent: () =>
          import(
            "./modules/public/register-church/validate-code/validate-code.component"
          ).then((m) => m.ValidateCodeComponent),
      },
      {
        path: "anuncios",
        data: {
          title: 'Anuncie no BuscaMissa | Patrocinadores',
          description: 'Conheça as opções de anúncio e patrocínio disponíveis no BuscaMissa.',
          canonical: 'https://buscamissa.com.br/anuncios',
        },
        loadComponent: () =>
          import("./modules/public/sponsors/sponsors.component").then(
            (m) => m.SponsorsComponent
          ),
      },
      {
        path: "contribuir",
        data: {
          title: 'Contribuir | BuscaMissa',
          description: 'Apoie o BuscaMissa e ajude a manter a plataforma gratuita para todos os fiéis.',
          canonical: 'https://buscamissa.com.br/contribuir',
        },
        loadComponent: () =>
          import("./modules/public/contribute/contribute.component").then(
            (m) => m.ContributeComponent
          ),
      },
      {
        path: "solicitar",
        data: {
          title: 'Fale Conosco | BuscaMissa',
          description: 'Entre em contato com o BuscaMissa. Envie sua dúvida, sugestão ou solicitação.',
          canonical: 'https://buscamissa.com.br/solicitar',
        },
        loadComponent: () =>
          import("./modules/public/request/request.component").then(
            (m) => m.RequestComponent
          ),
      },
      {
        path: "cookies",
        data: {
          title: 'Política de Cookies | BuscaMissa',
          description: 'Entenda como o BuscaMissa utiliza cookies para melhorar sua experiência.',
          canonical: 'https://buscamissa.com.br/cookies',
        },
        loadComponent: () =>
          import("./modules/public/terms/cookies/cookies.component").then(
            (m) => m.CookiesComponent
          ),
      },
      {
        path: "privacidade",
        data: {
          title: 'Política de Privacidade | BuscaMissa',
          description: 'Saiba como o BuscaMissa coleta, usa e protege seus dados pessoais.',
          canonical: 'https://buscamissa.com.br/privacidade',
        },
        loadComponent: () =>
          import("./modules/public/terms/privacy/privacy.component").then(
            (m) => m.PrivacyComponent
          ),
      },
      {
        path: "termos",
        data: {
          title: 'Termos de Uso | BuscaMissa',
          description: 'Leia os termos e condições de uso da plataforma BuscaMissa.',
          canonical: 'https://buscamissa.com.br/termos',
        },
        loadComponent: () =>
          import("./modules/public/terms/terms/terms.component").then(
            (m) => m.TermsComponent
          ),
      },
      { path: "", redirectTo: "home", pathMatch: "full" },
    ],
  },
  { path: "**", redirectTo: "home", pathMatch: "full" },
];
