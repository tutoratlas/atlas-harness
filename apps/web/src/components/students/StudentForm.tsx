"use client";

import { useState, useMemo } from "react";
import { StudentId, type Student, type CountryCode } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { randomUUID } from "~/lib/utils";
import { PhoneField, type PhoneValue } from "./PhoneField";
import { AddressFields, type AddressValue } from "./AddressFields";
import { ParentRows, type ParentInfo } from "./ParentRows";

export interface StudentFormProps {
  readonly mode: "create" | "edit";
  readonly initialStudent?: Student;
  readonly onSave: (student: Student) => void;
  readonly onCancel: () => void;
}

interface FormState {
  readonly name: string;
  readonly phone: PhoneValue | undefined;
  readonly subjects: string;
  readonly school: string;
  readonly address: AddressValue | undefined;
  readonly parents: ReadonlyArray<ParentInfo>;
  readonly notes: string;
}

function phoneValueFromContract(
  phone: { country: CountryCode; number: string } | undefined,
): PhoneValue | undefined {
  if (!phone) return undefined;
  return {
    countryCode: phone.country,
    number: phone.number,
  };
}

function phoneValueToContract(
  phone: PhoneValue | undefined,
):
  | {
      readonly country: CountryCode;
      readonly number: string;
    }
  | undefined {
  if (!phone || !phone.number.trim()) return undefined;
  return {
    country: phone.countryCode as CountryCode,
    number: phone.number.trim(),
  };
}

function addressValueFromContract(
  address:
    | {
        readonly block?: string;
        readonly street?: string;
        readonly building?: string;
        readonly unit?: string;
        readonly postalCode?: string;
      }
    | undefined,
): AddressValue | undefined {
  if (!address) return undefined;
  return {
    block: address.block,
    street: address.street,
    building: address.building,
    unit: address.unit,
    postalCode: address.postalCode,
  };
}

function addressValueToContract(
  address: AddressValue | undefined,
):
  | {
      readonly block?: string;
      readonly street?: string;
      readonly building?: string;
      readonly unit?: string;
      readonly postalCode?: string;
    }
  | undefined {
  if (!address) return undefined;
  const hasValue =
    address.block ||
    address.street ||
    address.building ||
    address.unit ||
    address.postalCode;
  if (!hasValue) return undefined;

  const result: {
    block?: string;
    street?: string;
    building?: string;
    unit?: string;
    postalCode?: string;
  } = {};

  if (address.block) result.block = address.block;
  if (address.street) result.street = address.street;
  if (address.building) result.building = address.building;
  if (address.unit) result.unit = address.unit;
  if (address.postalCode) result.postalCode = address.postalCode;

  return Object.keys(result).length > 0 ? result : undefined;
}

function parentsFromContract(
  parents:
    | ReadonlyArray<{
        readonly name?: string;
        readonly relationship?: string;
        readonly phone?: { readonly country: CountryCode; readonly number: string };
      }>
    | undefined,
): ReadonlyArray<ParentInfo> {
  if (!parents) return [];
  return parents.map((parent) => ({
    name: parent.name ?? "",
    relationship: parent.relationship ?? "",
    phone: phoneValueFromContract(parent.phone),
  }));
}

function parentsToContract(
  parents: ReadonlyArray<ParentInfo>,
):
  | ReadonlyArray<{
      readonly name?: string;
      readonly relationship?: string;
      readonly phone?: { readonly country: CountryCode; readonly number: string };
    }>
  | undefined {
  const cleaned = parents.filter((parent) => {
    const hasName = parent.name.trim().length > 0;
    const hasPhone = parent.phone && parent.phone.number.trim().length > 0;
    return hasName || hasPhone;
  });

  if (cleaned.length === 0) return undefined;

  return cleaned.map((parent) => {
    const result: {
      name?: string;
      relationship?: string;
      phone?: { country: CountryCode; number: string };
    } = {};

    if (parent.name.trim()) result.name = parent.name.trim();
    if (parent.relationship.trim()) result.relationship = parent.relationship.trim();
    const phone = phoneValueToContract(parent.phone);
    if (phone) result.phone = phone;

    return result;
  });
}

function validatePostalCode(postalCode: string | undefined): boolean {
  if (!postalCode) return true;
  return /^\d{6}$/.test(postalCode);
}

function hasAnyAddressValue(address: AddressValue | undefined): boolean {
  if (!address) return false;
  return Boolean(
    address.block || address.street || address.building || address.unit || address.postalCode,
  );
}

export function StudentForm({ mode, initialStudent, onSave, onCancel }: StudentFormProps) {
  const [formState, setFormState] = useState<FormState>(() => ({
    name: initialStudent?.name ?? "",
    phone: phoneValueFromContract(initialStudent?.phone),
    subjects: initialStudent?.subjects?.join(", ") ?? "",
    school: initialStudent?.school ?? "",
    address: addressValueFromContract(initialStudent?.address),
    parents: parentsFromContract(initialStudent?.parents),
    notes: initialStudent?.notes ?? "",
  }));

  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const addressError = useMemo(() => {
    if (!hasAnyAddressValue(formState.address)) return undefined;
    if (!validatePostalCode(formState.address?.postalCode)) {
      return "Postal code must be 6 digits when address is partially filled";
    }
    return undefined;
  }, [formState.address]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedName = formState.name.trim();
    if (!trimmedName) {
      setNameError("Name is required");
      return;
    }
    setNameError(undefined);

    if (addressError) {
      return;
    }

    const now = new Date().toISOString();
    const studentId = mode === "create"
      ? StudentId.make(randomUUID())
      : initialStudent?.id ?? StudentId.make(randomUUID());

    const phone = phoneValueToContract(formState.phone);
    const subjectsArray = formState.subjects
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const address = addressValueToContract(formState.address);
    const parents = parentsToContract(formState.parents);

    const student: Student = {
      id: studentId,
      name: trimmedName,
      createdAt: mode === "create" ? now : initialStudent?.createdAt ?? now,
      updatedAt: now,
      ...(phone && { phone }),
      ...(subjectsArray.length > 0 && { subjects: subjectsArray as readonly string[] }),
      ...(formState.school.trim() && { school: formState.school.trim() }),
      ...(address && { address }),
      ...(parents && { parents }),
      ...(formState.notes.trim() && { notes: formState.notes }),
    };

    onSave(student);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-1.5">
        <Label htmlFor="student-name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="student-name"
          value={formState.name}
          onChange={(event) => {
            setFormState({ ...formState, name: event.target.value });
            setNameError(undefined);
          }}
          placeholder="Student name"
          aria-invalid={nameError !== undefined}
          autoFocus
        />
        {nameError && <span className="text-xs text-destructive">{nameError}</span>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="student-phone">Phone (optional)</Label>
        <PhoneField
          value={formState.phone}
          onChange={(phone) => setFormState({ ...formState, phone })}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="student-subjects">Subjects (optional)</Label>
        <Input
          id="student-subjects"
          value={formState.subjects}
          onChange={(event) => setFormState({ ...formState, subjects: event.target.value })}
          placeholder="e.g. Math, Physics, Chemistry"
        />
        <span className="text-xs text-muted-foreground">
          Enter subjects separated by commas
        </span>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="student-school">School (optional)</Label>
        <Input
          id="student-school"
          value={formState.school}
          onChange={(event) => setFormState({ ...formState, school: event.target.value })}
          placeholder="e.g. Raffles Institution"
        />
      </div>

      <div className="grid gap-1.5">
        <Label>Address (optional)</Label>
        <AddressFields
          value={formState.address}
          onChange={(address) => setFormState({ ...formState, address })}
        />
        {addressError && <span className="text-xs text-destructive">{addressError}</span>}
      </div>

      <div className="grid gap-1.5">
        <Label>Parents (optional)</Label>
        <ParentRows
          parents={formState.parents}
          onChange={(parents) => setFormState({ ...formState, parents })}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="student-notes">Notes (optional)</Label>
        <Textarea
          id="student-notes"
          value={formState.notes}
          onChange={(event) => setFormState({ ...formState, notes: event.target.value })}
          placeholder="Additional notes about the student"
          rows={4}
        />
      </div>

      <div className="flex gap-2 border-t border-border/60 pt-4">
        <Button type="submit" variant="default">
          {mode === "create" ? "Create Student" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
