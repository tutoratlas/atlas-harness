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

export const CountryCode = Schema.Union([
  Schema.Literal("SG"),
  Schema.Literal("MY"),
  Schema.Literal("CN"),
]);
export type CountryCode = typeof CountryCode.Type;

export const PhoneNumber = Schema.Struct({
  country: CountryCode,
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
  // Plan 23: relative path to the student's on-disk materials folder,
  // e.g. "students/trevor-jc1-gp". Computed once when the folder is created.
  workspaceFolder: Schema.optionalKey(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Student = typeof Student.Type;

export const StudentRegistryDocument = Schema.Struct({
  version: TrimmedNonEmptyString,
  students: Schema.Array(Student),
});
export type StudentRegistryDocument = typeof StudentRegistryDocument.Type;

/**
 * Windows reserved names that cannot be used as filenames.
 * These need to be prefixed with '_' to avoid filesystem conflicts.
 */
const WINDOWS_RESERVED_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

/**
 * Derives a URL-safe slug from a student name (lowercase, hyphenated).
 * Plan 23 pairs this with a short id suffix to guarantee folder uniqueness.
 */
export function deriveStudentSlug(name: string): string {
  let slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // Prefix Windows reserved names with '_' to avoid filesystem conflicts
  if (WINDOWS_RESERVED_NAMES.has(slug)) {
    slug = `_${slug}`;
  }

  return slug;
}
