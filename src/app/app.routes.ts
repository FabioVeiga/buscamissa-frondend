import { Routes } from "@angular/router";
import { LayoutHomeComponent } from "./core/layout/home/layout/layout.component";

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
        path: "nova",
        data: {
          title: 'Cadastrar Igreja | BuscaMissa',
          description: 'Cadastre sua paróquia ou comunidade católica no BuscaMissa e ajude fiéis a encontrarem missas perto deles.',
          canonical: 'https://buscamissa.com.br/nova',
        },
        loadComponent: () =>
          import(
            "./modules/public/church/pages/church-registration-page/church-registration-page.component"
          ).then((m) => m.ChurchRegistrationPageComponent),
      },
      {
        path: "editar/:id",
        data: {
          title: 'Editar Igreja | BuscaMissa',
          description: 'Atualize as informações da sua paróquia ou comunidade católica no BuscaMissa.',
        },
        loadComponent: () =>
          import(
            "./modules/public/church/pages/church-edit-page/church-edit-page.component"
          ).then((m) => m.ChurchEditPageComponent),
      },
      {
        path: "detalhes/:cep",
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
          title: 'Validar Código | BuscaMissa',
          description: 'Valide seu código de confirmação para concluir o cadastro da igreja.',
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
          title: 'Solicitar Funcionalidade | BuscaMissa',
          description: 'Envie sua sugestão ou solicite uma nova funcionalidade para o BuscaMissa.',
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
