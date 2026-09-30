import { AbstractControl, ValidationErrors, ValidatorFn } from "@angular/forms";

// Validators.email do Angular é frouxo (aceita quase qualquer coisa com "@").
// Exige domínio com pelo menos um ponto e TLD de 2+ letras — mesmo espírito
// da validação reforçada no backend (Helpers/EmailValidoAttribute.cs).
const EMAIL_ESTRITO =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function emailEstritoValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    return EMAIL_ESTRITO.test(control.value) ? null : { emailInvalido: true };
  };
}
