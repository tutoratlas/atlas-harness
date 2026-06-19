"use client";

import { Input } from "../ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "../ui/select";

const COUNTRIES = [
  { code: "SG", dialCode: "+65" },
  { code: "MY", dialCode: "+60" },
  { code: "CN", dialCode: "+86" },
] as const;

export interface PhoneValue {
  readonly countryCode: string;
  readonly number: string;
}

export interface PhoneFieldProps {
  readonly value: PhoneValue | undefined;
  readonly onChange: (value: PhoneValue) => void;
  readonly placeholder?: string;
}

export function PhoneField({ value, onChange, placeholder }: PhoneFieldProps) {
  const countryCode = value?.countryCode ?? "SG";
  const number = value?.number ?? "";

  return (
    <div className="flex gap-2">
      <Select
        value={countryCode}
        onValueChange={(nextCountryCode) => {
          if (nextCountryCode !== null) {
            onChange({
              countryCode: nextCountryCode,
              number,
            });
          }
        }}
      >
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {COUNTRIES.map((country) => (
            <SelectItem key={country.code} value={country.code}>
              {country.code} {country.dialCode}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      <Input
        type="tel"
        value={number}
        onChange={(event) => {
          onChange({
            countryCode,
            number: event.target.value,
          });
        }}
        placeholder={placeholder ?? "Phone number"}
        className="flex-1"
      />
    </div>
  );
}
