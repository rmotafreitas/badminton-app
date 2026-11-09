import type { SessionUser } from "@bb/contracts";
import { useGoogleLogin } from "@react-oauth/google";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, CalendarCheck, KeyRound, Mail, Smartphone, Video } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/app/api";
import { useAppContext } from "@/app/context";
import { Brand } from "@/shared/components/logo";
import { useDictionary } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/shared/ui/input-otp";
import { Separator } from "@/shared/ui/separator";
import { Spinner } from "@/shared/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { completeSignIn, startSignIn } from "@/features/auth/api";
import { isStandalone } from "@/features/install";
import { CourtArt } from "./court-art";

const GOOGLE_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

function errorMessage(error: unknown, fallback: string): string {
  if (isApiError(error, 403) && error.message.includes("No account")) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

type Sent = { kind: "code" | "link"; channel: "email" | "phone"; target: string };

/** Email or phone: send a code (or a link), then type the 6 digits. */
function CodeSignIn({ channel, onSignedIn }: { channel: "email" | "phone"; onSignedIn: (user: SessionUser) => Promise<void> }) {
  const dict = useDictionary().ui;
  const { api } = useAppContext();
  const [target, setTarget] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState("");

  const send = useMutation({
    mutationFn: (kind: "code" | "link") =>
      startSignIn(
        api,
        channel === "phone" ? { provider: "phone", phone: target } : { provider: kind === "link" ? "email" : "email-code", email: target },
      ).then(() => kind),
    onSuccess: (kind) => {
      setSent({ kind, channel, target: target.trim() });
      setCode("");
    },
  });

  const verify = useMutation({
    mutationFn: (value: string) =>
      completeSignIn(api, channel === "phone" ? { provider: "phone", phone: target, code: value } : { provider: "email-code", email: target, code: value }),
    onSuccess: onSignedIn,
    onError: () => setCode(""),
  });

  if (sent?.kind === "link") {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mail className="size-6" />
        </div>
        <p className="text-sm text-muted-foreground">{fmt(dict.login.linkSentTo, { target: sent.target })}</p>
        <Button variant="ghost" size="sm" onClick={() => setSent(null)}>
          <ArrowLeft /> {dict.login.useDifferent}
        </Button>
      </div>
    );
  }

  if (sent) {
    return (
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) verify.mutate(code);
        }}
      >
        <p className="text-sm text-muted-foreground">{fmt(dict.login.codeSentTo, { target: sent.target })}</p>
        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            onComplete={(value) => verify.mutate(value)}
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            disabled={verify.isPending}
          >
            <InputOTPGroup>
              {Array.from({ length: 6 }, (_, i) => (
                <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        {verify.error && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(verify.error, dict.errors.body)}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={code.length !== 6 || verify.isPending}>
          {verify.isPending && <Spinner />} {dict.login.verify}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <Button type="button" variant="ghost" size="sm" onClick={() => setSent(null)}>
            <ArrowLeft /> {dict.login.useDifferent}
          </Button>
          <Button type="button" variant="link" size="sm" disabled={send.isPending} onClick={() => send.mutate("code")}>
            {dict.login.resend}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        send.mutate("code");
      }}
    >
      <Field>
        <FieldLabel htmlFor={`signin-${channel}`}>{channel === "phone" ? dict.login.phone : dict.login.email}</FieldLabel>
        <Input
          id={`signin-${channel}`}
          type={channel === "phone" ? "tel" : "email"}
          inputMode={channel === "phone" ? "tel" : "email"}
          autoComplete={channel === "phone" ? "tel" : "email"}
          placeholder={channel === "phone" ? dict.login.phonePlaceholder : dict.login.emailPlaceholder}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          required
          className="h-11"
        />
      </Field>
      {send.error && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(send.error, dict.errors.body)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="h-11 w-full" disabled={!target.trim() || send.isPending}>
        {send.isPending && <Spinner />} {dict.login.sendCode}
      </Button>
      {/* An emailed link opens in the browser, not in the installed app (on iOS they don't even share cookies): the
          home-screen app signs in with the code only. */}
      {channel === "email" && !isStandalone() && (
        <Button type="button" variant="link" className="w-full" disabled={!target.trim() || send.isPending} onClick={() => send.mutate("link")}>
          {dict.login.sendLink}
        </Button>
      )}
    </form>
  );
}

function PasswordSignIn({ onSignedIn }: { onSignedIn: (user: SessionUser) => Promise<void> }) {
  const dict = useDictionary().ui;
  const { api } = useAppContext();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useMutation({
    mutationFn: () => completeSignIn(api, { provider: "password", identifier, password }),
    onSuccess: onSignedIn,
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        signIn.mutate();
      }}
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="signin-identifier">{dict.login.identifier}</FieldLabel>
          <Input id="signin-identifier" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required className="h-11" />
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
      <Button type="submit" className="h-11 w-full" disabled={signIn.isPending}>
        {signIn.isPending && <Spinner />} {dict.login.signIn}
      </Button>
    </form>
  );
}

function GoogleButton({ onSignedIn }: { onSignedIn: (user: SessionUser) => Promise<void> }) {
  const dict = useDictionary().ui;
  const { api } = useAppContext();
  const signIn = useMutation({
    mutationFn: (accessToken: string) => completeSignIn(api, { provider: "google", accessToken }),
    onSuccess: onSignedIn,
    onError: (error) => toast.error(errorMessage(error, dict.errors.body)),
  });
  const login = useGoogleLogin({ onSuccess: (token) => signIn.mutate(token.access_token), flow: "implicit" });
  return (
    <Button type="button" variant="outline" className="h-11 w-full" disabled={signIn.isPending} onClick={() => login()}>
      {signIn.isPending ? (
        <Spinner />
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z" />
          <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z" />
        </svg>
      )}
      {dict.login.google}
    </Button>
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
          <Tabs defaultValue="email" className="gap-5">
            <TabsList className="grid h-10 w-full grid-cols-3">
              <TabsTrigger value="email">
                <Mail /> {dict.login.emailTab}
              </TabsTrigger>
              <TabsTrigger value="phone">
                <Smartphone /> {dict.login.phoneTab}
              </TabsTrigger>
              <TabsTrigger value="password">
                <KeyRound /> <span className="truncate">{dict.login.passwordTab}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="email">
              <CodeSignIn channel="email" onSignedIn={onSignedIn} />
            </TabsContent>
            <TabsContent value="phone">
              <CodeSignIn channel="phone" onSignedIn={onSignedIn} />
            </TabsContent>
            <TabsContent value="password">
              <PasswordSignIn onSignedIn={onSignedIn} />
            </TabsContent>
          </Tabs>
          {GOOGLE_ENABLED && (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
                <Separator className="flex-1" />
                {dict.login.or}
                <Separator className="flex-1" />
              </div>
              <GoogleButton onSignedIn={onSignedIn} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
