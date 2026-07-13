---
name: buscamissa-architecture
description: Arquitetura do BuscaMissa (frontend Angular 19 standalone + PrimeNG; backend .NET/EF Core + MySQL). Onde cada coisa mora, o que reutilizar e as regras do projeto. Consulte ANTES de criar componente, serviço, interface, controller, rota ou endpoint, ou ao decidir onde colocar código novo.
---

# Arquitetura — BuscaMissa

Site que ajuda a encontrar horários de missa por cidade/localização. Monorepo lógico:
- **Frontend** Angular em `C:\BuscaMissa\Frontend\buscamissa-frondend`
- **Backend** .NET em `C:\Desenvolvimento\BuscaMissa\BuscaMissa`

---

# Parte 1 — Frontend (Angular)

## Stack
- **Frontend:** Angular 19 (standalone components, sem NgModules) + PrimeNG 19 (tema `BuscaMissa` em `src/app/themes/mytheme.ts`) + ng-bootstrap + ngx-mask + Leaflet (mapas).
- **Backend:** .NET — consumido **sempre** pelos serviços em `core/services/` (base URL e token resolvidos por interceptors).
- **Analytics:** Google Analytics (`AnalyticsService`), Microsoft Clarity (`ClarityService`), métricas próprias (`MetricasService`).

## Estrutura de pastas — `src/app/`

```
core/          # Infra transversal (sem UI de página)
  interfaces/  # DTOs/contratos — FONTE ÚNICA de interfaces
  services/    # Serviços singleton (providedIn:'root')
  middleware/  # HTTP interceptors
  error/       # GlobalErrorHandler
  constants/   # states, weekdays, cidades-populares
  components/  # Infra de UI global (loading, modal)
  layout/      # header, footer, layout master da home
  misc/        # validadores (ex: validator-minute)
shared/        # Reutilizáveis de UI, sem regra de negócio
  components/  # church-result-card, mass-time-card, city-map, *-chip, confidence-badge, church-placeholder
  utils/       # mass-time, distance, church-link, social-icon
  models/      # mass-card.model (tipos de UI)
  primeng.module.ts  # agregador de imports PrimeNG
modules/       # Features por página/rota (NÃO se chama "features/")
  public/      # home (+details, +city), missa-agora, minhas-igrejas,
               # church, register-church, request, contribute, cidades,
               # como-funciona, terms, sponsors, cep-redirect ...
themes/        # mytheme.ts (preset PrimeNG)
app.routes.ts  # Rotas (loadComponent lazy, SEO em data)
app.config.ts  # Providers standalone (router, http+interceptors, PrimeNG, ngx-mask, GlobalErrorHandler)
```

Config de ambiente: `src/environments/` (`environment.ts` dev, `.staging`, `.production`, `.common`). Shape: `{ production, apiURL, token }`.

## Interfaces / DTOs
Ficam em **`core/interfaces/`**. É a fonte única — **não duplicar, sempre reutilizar**.
- `church.interface.ts` — `Church`, `Mass`, `Address`, `FilterSearchChurch`, `StatusConfianca`
- `user.interface.ts` — `User`, `AuthRequest`, `ValidatorCodeRequest`, `FilterSearchUser`
- `solicitacao.interface.ts` — DTOs de solicitação/contato

Tipos que são só de apresentação (UI) vivem em `shared/models/` (ex: `mass-card.model.ts` → `MassCardData`, `ConfidenceLevel`, `MassUrgency`).

## Serviços centrais — `core/services/`
| Serviço | Papel |
|---|---|
| `ChurchesService` | API principal de igrejas: buscar por CEP/filtros, criar/editar, horários próximos, confiabilidade (confirmações, fingerprint) |
| `SeoService` | **Centraliza SEO**: title, meta tags (OG/Twitter), canonical, JSON-LD |
| `AnalyticsService` | **Centraliza eventos** Google Analytics (pageviews + eventos custom) |
| `MetricasService` | Métricas próprias fire-and-forget (views, cliques, favoritos, shares) com throttling |
| `ClarityService` | Microsoft Clarity |
| `FavoritesService` | Favoritos em localStorage, exposto como Observable (single source of truth) |
| `GeolocationService` | Geolocalização + reverse-geocoding (Nominatim), ViaCEP |
| `NavigationHistoryService` | Histórico de navegação (voltar/forward custom) |
| `RedesSociaisService` | Redes sociais + ícones (cache via shareReplay) |
| `RequestService` / `ContributeService` | Solicitações / doações |
| `LoggerService` | Ponto único de log de erros (placeholder p/ Sentry/App Insights) |

## Interceptors — `core/middleware/`
- `AuthInterceptor` — injeta Bearer token.
- `ApiBaseUrlInterceptor` — prefixa a base URL (componentes/serviços não montam URL completa).
- `ErrorInterceptor` — trata erro HTTP.

Registrados via DI em `app.config.ts` (`HTTP_INTERCEPTORS`).

## Convenções (regras)
- **Interfaces/DTOs** → sempre em `core/interfaces/`. Nunca duplicar; reutilizar.
- **SEO** → sempre via `SeoService`. Não setar meta tags direto no componente.
- **Eventos/telemetria** → via `AnalyticsService` / `MetricasService` / `ClarityService`. Nunca chamar `gtag`/`clarity` solto.
- **HTTP** → sempre via serviço em `core/services/`. Componentes não montam URL nem headers (interceptors cuidam de base URL + auth).
- **UI reutilizável** → `shared/components/`; **lógica pura** → `shared/utils/`. Sempre checar o que já existe antes de criar.
- **Componentes standalone**; imports diretos, sem NgModule. Rotas com `loadComponent` (lazy) e SEO em `data` no `app.routes.ts`.
- **Nova feature** → pasta em `modules/public/<feature>/`, com subpasta `sections/` para os blocos internos.

## Antes de criar código novo — checklist de reuso
1. É um contrato/DTO? Já existe em `core/interfaces/`? Reutilize/estenda em vez de duplicar.
2. Precisa de SEO? Use `SeoService`.
3. Precisa registrar um evento/métrica? Use `AnalyticsService`/`MetricasService`/`ClarityService`.
4. Vai chamar a API? Existe método no serviço de `core/services/`? Se não, adicione **no serviço**, não no componente.
5. É um card/chip/badge/mapa de UI? Confira `shared/components/` antes de criar.
6. É formatação/cálculo (horário, distância, link, ícone)? Confira `shared/utils/`.
7. Nova página? Crie em `modules/public/<feature>/`, adicione rota lazy com metadata SEO em `app.routes.ts`.

---

# Parte 2 — Backend (.NET)

Projeto único ASP.NET Core (`BuscaMissa.csproj`), EF Core + **MySQL 8**, autenticação **JWT Bearer**, versionamento de API (`v1`/`v2`). Entrada e wiring de DI em `Program.cs`.

## Estrutura de pastas (raiz do backend)

```
Controllers/   # Endpoints HTTP, separados por versão: v1/ e v2/
Services/      # Regra de negócio (v1/, v2/ + serviços transversais na raiz)
Repositorios/  # Acesso a dados (interface + impl, ex: IMetricaDiariaRepositorio)
DTOs/          # Contratos de entrada/saída (ApiResponse<T>, *Dto por domínio, v1/ v2/)
Models/        # Entidades EF (Igreja, Missa, Endereco, Usuario, MetricaDiaria ...)
Context/       # ApplicationDbContext + DatabaseSeeder
Migrations/    # Migrations EF Core
Middlewares/   # CorrelationIdMiddleware, ExceptionHandlingMiddleware
Filters/       # Filtros/atributos (ex: NoProfanityAttribute)
Enums/         # Enums de domínio (StatusConfiancaEnum, DiaDaSemanaEnum ...)
Helpers/ Util/ # Utilitários
Constants/     # Constantes
Program.cs     # Bootstrap: DI, DbContext (MySQL), JWT, API versioning, Swagger, middlewares
appsettings*.json  # Config por ambiente (Development/Production)
```

## Fluxo de uma requisição
`Controller (v1|v2)` → valida/mapeia **DTO** → chama **Service** (regra de negócio) → **Repositorio**/`ApplicationDbContext` (EF) → **MySQL**. Resposta padronizada em `ApiResponse<T>` (`DTOs/ApiResponse.cs`).

Transversais: `CorrelationIdMiddleware` (rastreio) e `ExceptionHandlingMiddleware` (erros) rodam no pipeline; segredos vêm de Azure Key Vault.

## Versionamento v1 vs v2
- **v1** — CRUD/cadastro clássico: igrejas, usuários, aprovação, solicitações, redes sociais, contribuidores.
- **v2** — features novas: `IgrejaController` (busca/consulta pública), confiabilidade, engajamento, métricas, SEO, sitemap.
- Há classes com o mesmo nome nas duas versões (ex: `IgrejaService`) — sempre qualifique o namespace (`Services.v1` vs `Services.v2`), como já é feito em `Program.cs`.

## Convenções (backend)
- **Endpoint novo** → escolha a versão (`Controllers/v2` para features novas), Controller fino: sem regra de negócio, só orquestra DTO ↔ Service.
- **Regra de negócio** → em `Services/`. Controllers não acessam `DbContext` direto.
- **Acesso a dados** → via `ApplicationDbContext`/`Repositorios`. Mudança de schema = **migration EF** (não editar tabela na mão).
- **Contrato HTTP** → sempre `DTO` (nunca expor entidade `Models/` diretamente); resposta em `ApiResponse<T>`.
- **Registrar service novo** → `AddScoped` em `Program.cs`.
- **Enums de domínio** → em `Enums/`, compartilhando semântica com o frontend (ex: `StatusConfiancaEnum` ↔ `StatusConfianca` no front).

---

# Como front e back se conectam
- O frontend fala **só** com o backend via serviços em `core/services/`; `ApiBaseUrlInterceptor` injeta a base URL (`environment.apiURL`) e `AuthInterceptor` o token JWT.
- Ex.: busca por CEP → `ChurchesService` (front) → `IgrejaController` v2 (back) → `IgrejaService` → `ApplicationDbContext` → MySQL → `ApiResponse<T>` → interface `Church` (`core/interfaces/church.interface.ts`).
- Contratos devem casar: `DTOs/*` (back) ↔ `core/interfaces/*` (front). Ao mudar um, ajuste o outro.
