import type { SessionUser } from "@bb/contracts";
import { useMutation } from "@tanstack/react-query";
import type { CountryCode } from "libphonenumber-js/min";
import { BarChart3, CalendarCheck, Video } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { isApiError } from "@/app/api";
import { useAppContext } from "@/app/context";
import { Brand } from "@/shared/components/logo";
import { useDictionary } from "@/shared/i18n";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import { completeSignIn } from "@/features/auth/api";
import { CourtArt } from "./court-art";
import { DEFAULT_COUNTRY, PhoneField, toE164 } from "./phone-field";

function errorMessage(error: unknown, fallback: string): string {
  if (isApiError(error, 403) && error.message.includes("No account")) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function PhonePasswordSignIn({ onSignedIn }: { onSignedIn: (user: SessionUser) => Promise<void> }) {
  const dict = useDictionary().ui;
  const { api } = useAppContext();
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [number, setNumber] = useState("");
  const [password, setPassword] = useState("");
  const [invalidPhone, setInvalidPhone] = useState(false);
  const signIn = useMutation({
    mutationFn: (phone: string) => completeSignIn(api, { provider: "password", identifier: phone, password }),
    onSuccess: onSignedIn,
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        const phone = toE164(country, number);
        setInvalidPhone(!phone);
        if (phone) signIn.mutate(phone);
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={invalidPhone || undefined}>
          <FieldLabel htmlFor="signin-phone">{dict.login.phone}</FieldLabel>
          <PhoneField
            id="signin-phone"
            country={country}
            onCountryChange={(next) => {
              setCountry(next);
              setInvalidPhone(false);
            }}
            number={number}
            onNumberChange={(next) => {
              setNumber(next);
              setInvalidPhone(false);
            }}
            countryLabel={dict.login.country}
            placeholder={dict.login.phonePlaceholder}
            invalid={invalidPhone}
          />
          {invalidPhone && <FieldError>{dict.login.invalidPhone}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="signin-password">{dict.login.password}</FieldLabel>
          <Input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11"
          />
        </Field>
      </FieldGroup>
      {signIn.error && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(signIn.error, dict.errors.body)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="h-11 w-full" disabled={signIn.isPending || !number.trim() || !password}>
        {signIn.isPending && <Spinner />} {dict.login.signIn}
      </Button>
    </form>
  );
}

function Feature({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

export function LoginPage({ onSignedIn }: { onSignedIn: (user: SessionUser) => Promise<void> }) {
  const dict = useDictionary().ui;
  const nav = dict.nav;
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.42_0.12_154)] p-10 text-white lg:flex lg:flex-col dark:bg-[oklch(0.26_0.06_158)]">
        <CourtArt className="absolute -right-24 -bottom-40 h-[135%] rotate-[-18deg] text-white/[0.09]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,oklch(0.62_0.16_150/0.55),transparent_60%)]" />
        <Brand className="relative [&_span:last-child]:text-white/70" subtitle={dict.tagline} />
        <div className="relative mt-auto max-w-md space-y-6">
          <h2 className="text-4xl font-semibold tracking-tight text-balance">{dict.login.heroTitle}</h2>
          <p className="text-lg text-white/80">{dict.login.heroBody}</p>
          <ul className="space-y-3 text-sm text-white/90">
            <Feature icon={<BarChart3 className="size-4" />}>{nav.games}</Feature>
            <Feature icon={<Video className="size-4" />}>{nav.analysis}</Feature>
            <Feature icon={<CalendarCheck className="size-4" />}>{nav.training}</Feature>
          </ul>
        </div>
      </aside>
      <main className="flex flex-col items-center justify-center px-5 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          <Brand className="lg:hidden" subtitle={dict.tagline} />
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{dict.login.welcome}</h1>
            <p className="text-sm text-muted-foreground">{dict.login.subtitle}</p>
          </div>
          <PhonePasswordSignIn onSignedIn={onSignedIn} />
        </div>
      </main>
    </div>
  );
}
