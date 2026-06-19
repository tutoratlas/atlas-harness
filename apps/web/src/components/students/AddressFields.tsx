"use client";

import { useMemo } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export interface AddressValue {
  readonly block: string | undefined;
  readonly street: string | undefined;
  readonly building: string | undefined;
  readonly unit: string | undefined;
  readonly postalCode: string | undefined;
}

export interface AddressFieldsProps {
  readonly value: AddressValue | undefined;
  readonly onChange: (value: AddressValue) => void;
}

function validatePostalCode(postalCode: string | undefined): string | undefined {
  if (!postalCode) return undefined;
  if (!/^\d{6}$/.test(postalCode)) {
    return "Postal code must be 6 digits";
  }
  return undefined;
}

function hasAnyAddressValue(value: AddressValue | undefined): boolean {
  if (!value) return false;
  return Boolean(
    value.block || value.street || value.building || value.unit || value.postalCode,
  );
}

export function AddressFields({ value, onChange }: AddressFieldsProps) {
  const block = value?.block ?? "";
  const street = value?.street ?? "";
  const building = value?.building ?? "";
  const unit = value?.unit ?? "";
  const postalCode = value?.postalCode ?? "";

  const postalCodeError = useMemo(() => {
    if (!hasAnyAddressValue(value)) {
      return undefined;
    }
    return validatePostalCode(postalCode);
  }, [value, postalCode]);

  const handleChange = (field: keyof AddressValue, fieldValue: string) => {
    onChange({
      block: value?.block ?? undefined,
      street: value?.street ?? undefined,
      building: value?.building ?? undefined,
      unit: value?.unit ?? undefined,
      postalCode: value?.postalCode ?? undefined,
      [field]: fieldValue,
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-1.5">
        <Label htmlFor="address-block">Block (optional)</Label>
        <Input
          id="address-block"
          value={block}
          onChange={(event) => handleChange("block", event.target.value)}
          placeholder="e.g. 123"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="address-street">Street (optional)</Label>
        <Input
          id="address-street"
          value={street}
          onChange={(event) => handleChange("street", event.target.value)}
          placeholder="e.g. Orchard Road"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="address-building">Building (optional)</Label>
        <Input
          id="address-building"
          value={building}
          onChange={(event) => handleChange("building", event.target.value)}
          placeholder="e.g. Plaza Singapura"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="address-unit">Unit (optional)</Label>
        <Input
          id="address-unit"
          value={unit}
          onChange={(event) => handleChange("unit", event.target.value)}
          placeholder="e.g. #01-23"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="address-postal-code">Postal Code (optional)</Label>
        <Input
          id="address-postal-code"
          value={postalCode}
          onChange={(event) => handleChange("postalCode", event.target.value)}
          placeholder="e.g. 123456"
          aria-invalid={postalCodeError !== undefined}
        />
        {postalCodeError && (
          <span className="text-xs text-destructive">{postalCodeError}</span>
        )}
      </div>
    </div>
  );
}
