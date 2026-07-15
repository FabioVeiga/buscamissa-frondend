import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { map } from "rxjs";
import { FeatureToggleService } from "../services/feature-toggle.service";

/**
 * Bloqueia uma rota quando o feature toggle (route data: featureToggleKey)
 * está desligado, redirecionando para /home. Falha de rede é tratada no
 * próprio FeatureToggleService (default: liberado).
 */
export const featureToggleGuard: CanActivateFn = (route) => {
  const featureToggleService = inject(FeatureToggleService);
  const router = inject(Router);
  const chave = route.data["featureToggleKey"] as string;

  return featureToggleService.isEnabled(chave).pipe(
    map((habilitado) => habilitado || router.createUrlTree(["/home"]))
  );
};
