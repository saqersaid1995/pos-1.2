import { useEffect, useState, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  fetchCountryCodes,
  buildE164,
  stripLeadingZero,
  parsePhone,
  type CountryCode,
} from "@/lib/phone";
import { toast } from "sonner";

export interface PhoneInputValue {
  countryCode: string;
  localPhone: string;
  fullE164: string;
}

interface Props {
  value?: PhoneInputValue;
  /** Convenience: parse from a single raw phone (legacy support) */
  rawPhone?: string;
  onChange: (v: PhoneInputValue) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Show country name in dropdown (default true) */
  showName?: boolean;
}

export default function PhoneInput({
  value,
  rawPhone,
  onChange,
  placeholder = "Phone number",
  autoFocus,
  className,
  inputClassName,
  disabled,
  onKeyDown,
  onFocus,
  inputRef,
  showName = true,
}: Props) {
  const [codes, setCodes] = useState<CountryCode[]>([]);
  const [cc, setCc] = useState<string>(value?.countryCode || "+968");
  const [local, setLocal] = useState<string>(value?.localPhone || "");

  // Load country codes
  useEffect(() => {
    let alive = true;
    fetchCountryCodes().then((list) => {
      if (!alive) return;
      const active = list.filter((c) => c.is_active);
      setCodes(active.length ? active : list);
      if (!value?.countryCode && !rawPhone) {
        const def = active.find((c) => c.is_default) || active[0];
        if (def) setCc(def.country_code);
      }
    });
    return () => { alive = false; };
  }, []);

  // Sync from controlled value
  useEffect(() => {
    if (value) {
      if (value.countryCode && value.countryCode !== cc) setCc(value.countryCode);
      if (value.localPhone !== local) setLocal(value.localPhone || "");
    }
  }, [value?.countryCode, value?.localPhone]);

  // Parse rawPhone if provided (uncontrolled)
  useEffect(() => {
    if (rawPhone == null || codes.length === 0) return;
    const parsed = parsePhone(rawPhone, codes.map((c) => c.country_code), cc);
    if (parsed.countryCode !== cc) setCc(parsed.countryCode);
    if (parsed.localPhone !== local) setLocal(parsed.localPhone);
  }, [rawPhone, codes.length]);

  const emit = useCallback(
    (nextCc: string, nextLocal: string) => {
      onChange({ countryCode: nextCc, localPhone: nextLocal, fullE164: buildE164(nextCc, nextLocal) });
    },
    [onChange],
  );

  const handleLocalChange = (raw: string) => {
    // Allow only digits, spaces, dashes; keep digits
    const digits = raw.replace(/\D/g, "");
    setLocal(digits);
    emit(cc, digits);
  };

  const handleBlur = () => {
    if (!local) return;
    const { value: stripped, stripped: didStrip } = stripLeadingZero(local);
    if (didStrip) {
      setLocal(stripped);
      emit(cc, stripped);
      toast.warning("Removed leading zero from phone number");
    }
  };

  const handleCcChange = (next: string) => {
    setCc(next);
    emit(next, local);
  };

  return (
    <div className={cn("flex gap-2 items-stretch", className)}>
      <Select value={cc} onValueChange={handleCcChange} disabled={disabled}>
        <SelectTrigger className="w-[130px] shrink-0 font-mono text-sm">
          <SelectValue>{cc}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {codes.map((c) => (
            <SelectItem key={c.id} value={c.country_code}>
              <span className="font-mono">{c.country_code}</span>
              {showName && <span className="text-muted-foreground ml-2 text-xs">{c.country_name}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={local}
        onChange={(e) => handleLocalChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        disabled={disabled}
        className={cn("flex-1", inputClassName)}
        autoComplete="off"
      />
    </div>
  );
}
