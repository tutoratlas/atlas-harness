import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString, IsoDateTime } from "./baseSchemas.ts";

/**
 * Construct a branded identifier. Enforces non-empty trimmed strings
 */
const makeEntityId = <Brand extends string>(brand: Brand) => {
  return TrimmedNonEmptyString.pipe(Schema.brand(brand));
};

export const StudentId = makeEntityId("StudentId");
export type StudentId = typeof StudentId.Type;

export const PhoneNumber = Schema.Struct({
  country: TrimmedNonEmptyString,
  number: TrimmedNonEmptyString,
});
export type PhoneNumber = typeof PhoneNumber.Type;

export const SingaporeAddress = Schema.Struct({
  block: Schema.optionalKey(TrimmedNonEmptyString),
  street: Schema.optionalKey(TrimmedNonEmptyString),
  building: Schema.optionalKey(TrimmedNonEmptyString),
  unit: Schema.optionalKey(TrimmedNonEmptyString),
  postalCode: Schema.optionalKey(TrimmedNonEmptyString),
});
export type SingaporeAddress = typeof SingaporeAddress.Type;

export const Parent = Schema.Struct({
  name: Schema.optionalKey(TrimmedNonEmptyString),
  relationship: Schema.optionalKey(TrimmedNonEmptyString),
  phone: Schema.optionalKey(PhoneNumber),
});
export type Parent = typeof Parent.Type;

export const Student = Schema.Struct({
  id: StudentId,
  name: TrimmedNonEmptyString,
  phone: Schema.optionalKey(PhoneNumber),
  parents: Schema.optionalKey(Schema.Array(Parent)),
  subjects: Schema.optionalKey(Schema.Array(TrimmedNonEmptyString)),
  school: Schema.optionalKey(TrimmedNonEmptyString),
  address: Schema.optionalKey(SingaporeAddress),
  notes: Schema.optionalKey(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Student = typeof Student.Type;

export const StudentRegistryDocument = Schema.Struct({
  version: TrimmedNonEmptyString,
  students: Schema.Array(Student),
});
export type StudentRegistryDocument = typeof StudentRegistryDocument.Type;
