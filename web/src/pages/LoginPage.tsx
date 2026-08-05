import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/hooks/useAuth";
import { useDictionary } from "@/i18n";
import { getErrorMessage } from "@/lib/errors";
import type { Dictionary } from "@/i18n";
import { Logo } from "@/components/Logo";
import { FullPageLoader } from "@/components/ui";

type Step =
  | { type: "select" }
  | { type: "email-code-input" }
  | { type: "email-code-verify"; email: string }
  | { type: "password-input" };

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function LoginPage() {
  const [step, setStep] = useState<Step>({ type: "select" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams] = useSearchParams();

  const { initiateAuth, completeAuth, isAuthenticated, loading, authPhase, isReconnecting } = useAuth();
  const navigate = useNavigate();
  const dict = useDictionary().auth;
  const common = useDictionary().common;
  const sidebar = useDictionary().sidebar;
  const footer = useDictionary().footer;

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/dashboard");
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "invalid-token") setError(dict.invalidToken);
  }, [searchParams, dict.invalidToken]);

  // While the session is being resolved (no cached snapshot, probing /auth/me),
  // never paint the login form — that is what causes the login-page flash.
  if (authPhase === "restoring") {
    return <FullPageLoader label={common.restoringSession} />;
  }

  // Server is asleep / network issue — we have a cached session, retrying with backoff.
  // Don't flash the login form; show a reconnecting message instead.
  if (isReconnecting) {
    return <FullPageLoader label={common.reconnecting} />;
  }

  function translateAuthError(
    raw: string,
    authDict: Dictionary["auth"],
  ): string {
    if (raw.startsWith("Unknown auth provider"))
      return authDict.unknownAuthProvider;

    const map: Record<string, string> = {
      "No account found. Please contact your administrator to create one.":
        authDict.registrationDisabled,
      "Account is deactivated": authDict.accountDeactivated,
      "User not found or inactive": authDict.accountDeactivated,
      "Invalid credentials": authDict.invalidCredentials,
      "Email or phone and password are required": authDict.invalidCredentials,
      "Invalid or expired link": authDict.invalidOrExpiredLink,
      "Link already used": authDict.linkAlreadyUsed,
      "Link has expired": authDict.linkExpired,
      "Invalid code": authDict.invalidCode,
      "Code already used": authDict.codeAlreadyUsed,
      "Code has expired": authDict.codeExpired,
      "Valid email is required": authDict.invalidEmail,
      "Email and code are required": authDict.invalidEmail,
      "Token is required": authDict.invalidOrExpiredLink,
    };

    return map[raw] ?? raw;
  }

  const withLoading = async (fn: () => Promise<void>) => {
    setError("");
    setIsLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(translateAuthError(getErrorMessage(e), dict));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = (credential: string) =>
    withLoading(async () => {
      await completeAuth("google", { credential });
      navigate("/dashboard");
    });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    const isEmail = trimmed.includes("@");
    withLoading(async () => {
      await completeAuth("password", {
        [isEmail ? "email" : "phone"]: isEmail
          ? trimmed.toLowerCase()
          : trimmed,
        password,
      });
      navigate("/dashboard");
    });
  };

  const handleEmailCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    withLoading(async () => {
      await initiateAuth("email-code", { email: email.trim().toLowerCase() });
      setStep({ type: "email-code-verify", email: email.trim().toLowerCase() });
    });
  };

  const handleEmailCodeVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (step.type !== "email-code-verify") return;
    withLoading(async () => {
      await completeAuth("email-code", { email: step.email, code });
      navigate("/dashboard");
    });
  };

  return (
    <div className="w-full max-w-4xl bg-card sm:rounded-lg sm:shadow-2xl overflow-hidden flex md:flex-row flex-col min-h-dvh sm:min-h-0">
      {/* Image side */}
      <div className="md:w-1/2 relative h-[200px] md:h-auto md:min-h-[500px]">
        <img
          src="/images/login.gif"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      {/* Form side */}
      <div className="md:w-1/2 p-6 sm:p-10 flex flex-col flex-1 md:min-h-[500px]">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {sidebar.brandName}{" "}
              <span className="font-black">{sidebar.brandApp}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{dict.loginDesc}</p>
          </div>
          <div className="shrink-0">
            <Logo className="w-12 h-12" />
          </div>
        </div>

        {error && (
          <div className="notification red mb-4">
            <div>
              <span className="icon">
                <i className="mdi mdi-alert"></i>
              </span>
              {error}
            </div>
          </div>
        )}

        {step.type === "select" && (
          <div className="space-y-3">
            {googleClientId && (
              <>
                <div className="flex justify-center">
                  <GoogleLogin
                    onSuccess={(res) => {
                      if (res.credential) handleGoogleSuccess(res.credential);
                    }}
                    onError={() => setError(dict.googleSignInFailed)}
                    width="368"
                    text="continue_with"
                    shape="rectangular"
                  />
                </div>

                <div className="mt-4 flex gap-4 text-xs text-muted-foreground/70">
                  <a href="#" className="hover:text-muted-foreground">
                    {footer.privacyPolicy}
                  </a>
                  <a href="#" className="hover:text-muted-foreground">
                    {footer.termsOfService}
                  </a>
                </div>

                <hr />
              </>
            )}

            <button
              onClick={() => setStep({ type: "email-code-input" })}
              className="button w-full justify-start light"
            >
              <span className="icon">
                <i className="mdi mdi-email-outline"></i>
              </span>
              <span>{dict.continueWithEmail}</span>
            </button>

            <button
              onClick={() => setStep({ type: "password-input" })}
              className="button w-full justify-start light"
            >
              <span className="icon">
                <i className="mdi mdi-key"></i>
              </span>
              <span>{dict.signInWithPassword}</span>
            </button>
          </div>
        )}

        {step.type === "email-code-input" && (
          <form onSubmit={handleEmailCodeSubmit}>
            <div className="field">
              <label className="label">{common.emailAddress}</label>
              <div className="control icons-left">
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder={common.emailPlaceholder}
                />
                <span className="icon left">
                  <i className="mdi mdi-email"></i>
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="button blue flex-1"
                disabled={isLoading || !isValidEmail(email)}
              >
                {isLoading ? common.sending : common.sendVerificationCode}
              </button>
              <button
                type="button"
                className="button light flex-1"
                onClick={() => setStep({ type: "select" })}
              >
                {common.back}
              </button>
            </div>
          </form>
        )}

        {step.type === "email-code-verify" && (
          <form onSubmit={handleEmailCodeVerify}>
            <p className="text-sm text-muted-foreground text-center mb-4">
              {dict.enter4DigitCode} <strong>{step.email}</strong>
            </p>
            <div className="field">
              <div className="control">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                  className="input text-center text-2xl tracking-widest"
                  placeholder="0000"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="button blue flex-1"
                disabled={isLoading || code.length !== 4}
              >
                {isLoading ? common.verifying : common.verifyCode}
              </button>
              <button
                type="button"
                className="button light flex-1"
                onClick={() => {
                  setCode("");
                  setStep({ type: "email-code-input" });
                }}
              >
                {common.resendCode}
              </button>
            </div>
          </form>
        )}

        {step.type === "password-input" && (
          <form onSubmit={handlePasswordSubmit}>
            <div className="field">
              <label className="label">{common.emailOrPhone}</label>
              <div className="control icons-left">
                <input
                  className="input"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder={common.emailOrPhone}
                />
                <span className="icon left">
                  <i className="mdi mdi-account"></i>
                </span>
              </div>
            </div>
            <div className="field">
              <label className="label">{common.password}</label>
              <div className="control icons-left">
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder={common.passwordPlaceholder}
                />
                <span className="icon left">
                  <i className="mdi mdi-asterisk"></i>
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="button blue flex-1"
                disabled={isLoading || !email || !password}
              >
                {isLoading ? common.signingIn : common.signIn}
              </button>
              <button
                type="button"
                className="button light flex-1"
                onClick={() => setStep({ type: "select" })}
              >
                {common.back}
              </button>
            </div>
          </form>
        )}

        <div className="mt-auto pt-6 flex gap-4 text-xs text-muted-foreground/70">
          <a href="#" className="hover:text-muted-foreground">
            {footer.privacyPolicy}
          </a>
          <a href="#" className="hover:text-muted-foreground">
            {footer.termsOfService}
          </a>
        </div>
      </div>
    </div>
  );
}
