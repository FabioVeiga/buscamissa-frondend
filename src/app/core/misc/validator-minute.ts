import { AbstractControl, ValidationErrors, ValidatorFn } from "@angular/forms";

export function horarioMinutosValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;

    let minutos: string;

    if (control.value instanceof Date) {
      // Obtém os minutos do objeto Date
      minutos = control.value.getMinutes().toString().padStart(2, "0");
    } else {
      // Caso venha como string
      const valor = control.value;
      minutos = valor.split(":")[1];
    }

    const validMinutes = ['00', '15', '30', '45'];
    return validMinutes.includes(minutos) ? null : { minutosInvalidos: true };
  };
}