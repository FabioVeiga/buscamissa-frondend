import { ImageModule } from 'primeng/image';
import { DataViewModule } from 'primeng/dataview';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Importar todos os módulos do PrimeNG
import { FieldsetModule } from 'primeng/fieldset';
import { InputMaskModule } from 'primeng/inputmask';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { FileUploadModule } from 'primeng/fileupload';
import { ToastModule } from 'primeng/toast';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { FloatLabelModule } from 'primeng/floatlabel';
import { KeyFilterModule } from 'primeng/keyfilter';
import { IftaLabelModule } from 'primeng/iftalabel';
import { PanelModule } from 'primeng/panel';
import { CheckboxModule } from 'primeng/checkbox';
import { InputOtpModule } from 'primeng/inputotp';
import { DividerModule } from 'primeng/divider';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';

@NgModule({
  imports: [
    CommonModule,
    FieldsetModule,
    InputMaskModule,
    IftaLabelModule,
    InputTextModule,
    InputNumberModule,
    ButtonModule,
    SelectModule,
    DatePickerModule,
    FileUploadModule,
    ToastModule,
    InputGroupModule,
    InputGroupAddonModule,
    FloatLabelModule,
    KeyFilterModule,
    PanelModule,
    DataViewModule,
    ImageModule,
    CheckboxModule,
    InputOtpModule,
    DividerModule,
    InputIconModule,
    IconFieldModule,
    TooltipModule,
    DialogModule,
    Select,
    FormsModule,
    CardModule
  ],
  exports: [
    FieldsetModule,
    InputMaskModule,
    IftaLabelModule,
    InputTextModule,
    InputNumberModule,
    ButtonModule,
    SelectModule,
    DatePickerModule,
    FileUploadModule,
    ToastModule,
    InputGroupModule,
    InputGroupAddonModule,
    FloatLabelModule,
    KeyFilterModule,
    PanelModule,
    DataViewModule,
    ImageModule,
    CheckboxModule,
    InputOtpModule,
    DividerModule,
    InputIconModule,
    IconFieldModule,
    TooltipModule,
    DialogModule,
    Select,
    FormsModule,
    CardModule
  ]
})
export class PrimeNgModule { }
