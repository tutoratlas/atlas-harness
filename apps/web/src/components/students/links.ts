import type { PhoneNumber, SingaporeAddress } from "@t3tools/contracts";

/**
 * Country code to dial code mapping
 */
const COUNTRY_DIAL_CODES: Record<string, string> = {
  SG: "65",
  MY: "60",
  CN: "86",
};

/**
 * Converts a PhoneNumber to E.164 format (without + prefix)
 * @param phone - Phone number with country and number fields
 * @returns E.164 formatted phone number or empty string if invalid
 */
function toE164(phone: PhoneNumber | undefined): string {
  if (!phone?.country || !phone?.number) {
    return "";
  }

  const dialCode = COUNTRY_DIAL_CODES[phone.country.toUpperCase()];
  if (!dialCode) {
    return "";
  }

  // Remove any non-digit characters from the number
  const cleanNumber = phone.number.replace(/\D/g, "");
  if (!cleanNumber) {
    return "";
  }

  return `${dialCode}${cleanNumber}`;
}

/**
 * Builds WhatsApp deep link URL
 * @param phone - Phone number to create link for
 * @returns WhatsApp URL or empty string if phone is invalid
 */
export function whatsAppLink(phone: PhoneNumber | undefined): string {
  const e164 = toE164(phone);
  if (!e164) {
    return "";
  }
  return `https://wa.me/${e164}`;
}

/**
 * Builds Telegram deep link URL
 * @param phone - Phone number to create link for
 * @returns Telegram URL or empty string if phone is invalid
 */
export function telegramLink(phone: PhoneNumber | undefined): string {
  const e164 = toE164(phone);
  if (!e164) {
    return "";
  }
  return `https://t.me/+${e164}`;
}

/**
 * Formats a Singapore address into a single line string
 * @param address - Singapore address with optional fields
 * @returns Formatted address string or empty string if no fields are present
 */
function formatAddress(address: SingaporeAddress | undefined): string {
  if (!address) {
    return "";
  }

  const parts: string[] = [];

  if (address.block) {
    parts.push(`Blk ${address.block}`);
  }

  if (address.street) {
    parts.push(address.street);
  }

  if (address.building) {
    parts.push(address.building);
  }

  if (address.unit) {
    parts.push(address.unit);
  }

  if (address.postalCode) {
    parts.push(`Singapore ${address.postalCode}`);
  }

  return parts.join(", ");
}

/**
 * Builds Google Maps search URL for a Singapore address
 * @param address - Singapore address to create link for
 * @returns Google Maps URL or empty string if address is invalid
 */
export function googleMapsLink(address: SingaporeAddress | undefined): string {
  const formattedAddress = formatAddress(address);
  if (!formattedAddress) {
    return "";
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formattedAddress)}`;
}
