import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function horarioMinutosValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null; // Permite valor vazio

    const valor = control.value;
    const minutos = valor.split(":")[1];

    // Valida se os minutos são 00, 15, 30 ou 45
    const validMinutes = ['00', '15', '30', '45'];
    return validMinutes.includes(minutos) ? null : { minutosInvalidos: true };
  };
}