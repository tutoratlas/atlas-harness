const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

const MAX_SLUG_LENGTH = 64;

export function sanitizeStudentSlug(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Convert to lowercase and replace non-alphanumeric chars (except hyphens) with hyphens
  let slug = input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    // Replace multiple consecutive hyphens with single hyphen
    .replace(/-+/g, '-')
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, '');

  // Truncate to max length
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH);
    // Remove trailing hyphen if truncation created one
    slug = slug.replace(/-+$/, '');
  }

  // Check for Windows reserved names
  const upperSlug = slug.toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(upperSlug)) {
    slug = `${slug}-slug`;
  }

  return slug;
}
