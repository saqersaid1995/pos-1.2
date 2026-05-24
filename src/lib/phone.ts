import { supabase } from "@/integrations/supabase/client";

export interface CountryCode {
  id: string;
  country_name: string;
  country_code: string; // e.g. "+968"
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

let cache: CountryCode[] | null = null;
let cachePromise: Promise<CountryCode[]> | null = null;

export async function fetchCountryCodes(force = false): Promise<CountryCode[]> {
  if (cache && !force) return cache;
  if (cachePromise && !force) return cachePromise;
  cachePromise = (async () => {
    const { data } = await supabase
      .from("whatsapp_country_codes" as any)
      .select("*")
      .order("sort_order", { ascending: true });
    cache = ((data as any) || []) as CountryCode[];
    cachePromise = null;
    return cache;
  })();
  return cachePromise;
}

export function clearCountryCodeCache() {
  cache = null;
  cachePromise = null;
}

export async function getDefaultCountryCode(): Promise<string> {
  const list = await fetchCountryCodes();
  const def = list.find((c) => c.is_default && c.is_active) || list.find((c) => c.is_active) || list[0];
  return def?.country_code || "+968";
}

/** Strip everything except digits and a leading + */
export function cleanRaw(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const plus = trimmed.startsWith("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) return "+" + digits.slice(2);
  return (plus ? "+" : "") + digits;
}

/** Strip a single leading zero from the local part (returns [stripped, didStrip]) */
export function stripLeadingZero(local: string): { value: string; stripped: boolean } {
  if (local.length > 1 && local.startsWith("0")) {
    return { value: local.replace(/^0+/, ""), stripped: true };
  }
  return { value: local, stripped: false };
}

export interface ParsedPhone {
  countryCode: string;
  localPhone: string;
  fullE164: string;
}

export function parsePhone(
  raw: string,
  knownCodes: string[],
  fallbackCountry: string,
): ParsedPhone {
  const cleaned = cleanRaw(raw);
  if (!cleaned) return { countryCode: fallbackCountry, localPhone: "", fullE164: "" };

  if (cleaned.startsWith("+")) {
    // Find longest matching country code
    const sorted = [...knownCodes].sort((a, b) => b.length - a.length);
    for (const cc of sorted) {
      if (cleaned.startsWith(cc)) {
        const local = cleaned.slice(cc.length);
        return { countryCode: cc, localPhone: local, fullE164: cc + local };
      }
    }
    // unknown country – best effort: 3-digit code
    const cc = cleaned.slice(0, 4); // +XXX
    const local = cleaned.slice(4);
    return { countryCode: cc, localPhone: local, fullE164: cleaned };
  }

  // No "+"; assume local digits with fallback country
  return {
    countryCode: fallbackCountry,
    localPhone: cleaned,
    fullE164: fallbackCountry + cleaned,
  };
}

export function buildE164(countryCode: string, localPhone: string): string {
  const cc = countryCode.startsWith("+") ? countryCode : "+" + countryCode;
  const local = localPhone.replace(/\D/g, "");
  return cc + local;
}

/** For Graph API – digits only, no leading + */
export function toGraphRecipient(e164OrAny: string): string {
  return (e164OrAny || "").replace(/\D/g, "");
}
