import { type CountryCode, getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js/min";
import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { useLanguage } from "@/shared/i18n";
import { Input } from "@/shared/ui/input";

export const DEFAULT_COUNTRY: CountryCode = "PT";

/** 🇵🇹 from "PT": two regional-indicator letters. */
const flag = (country: CountryCode) =>
  String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

/** E.164 (`+351912345678`) when the number is valid for that country, otherwise null. */
export function toE164(country: CountryCode, national: string): string | null {
  const parsed = parsePhoneNumberFromString(national, country);
  return parsed?.isValid() ? parsed.number : null;
}

function useCountries() {
  const { lang } = useLanguage();
  return useMemo(() => {
    const names = new Intl.DisplayNames([lang], { type: "region" });
    const all = getCountries().map((code) => ({ code, name: names.of(code) ?? code, dial: getCountryCallingCode(code) }));
    all.sort((a, b) => a.name.localeCompare(b.name, lang));
    // Portugal first: nearly everyone signing in is there.
    return [...all.filter((c) => c.code === DEFAULT_COUNTRY), ...all.filter((c) => c.code !== DEFAULT_COUNTRY)];
  }, [lang]);
}

/** Flags come from our own font (see `@font-face` in styles.css): Windows and many Linux browsers have none. */
const FLAG_FONT = { fontFamily: '"Country Flags", var(--font-sans)' };

/**
 * Country (flag + dialling code) and the national number. The country is a native <select> laid over the visible
 * chip: on phones it opens the system picker, which is searchable and thumb-friendly.
 */
export function PhoneField({
  id,
  country,
  onCountryChange,
  number,
  onNumberChange,
  countryLabel,
  placeholder,
  invalid,
}: {
  id: string;
  country: CountryCode;
  onCountryChange: (country: CountryCode) => void;
  number: string;
  onNumberChange: (number: string) => void;
  countryLabel: string;
  placeholder?: string;
  invalid?: boolean;
}) {
  const countries = useCountries();
  return (
    <div className="flex gap-2">
      <div className="relative shrink-0">
        <div
          aria-hidden="true"
          className="flex h-11 items-center gap-1.5 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs dark:bg-input/30"
          style={FLAG_FONT}
        >
          <span className="text-lg leading-none">{flag(country)}</span>
          <span className="tabular-nums">+{getCountryCallingCode(country)}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
        <select
          aria-label={countryLabel}
          value={country}
          onChange={(e) => onCountryChange(e.target.value as CountryCode)}
          className="absolute inset-0 cursor-pointer opacity-0"
          style={FLAG_FONT}
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {flag(c.code)} {c.name} (+{c.dial})
            </option>
          ))}
        </select>
      </div>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder}
        value={number}
        onChange={(e) => onNumberChange(e.target.value)}
        aria-invalid={invalid || undefined}
        required
        className="h-11 min-w-0 flex-1"
      />
    </div>
  );
}
