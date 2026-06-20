import { Component, useState, useEffect, useCallback } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/hooks/useAuth";
import { useDictionary } from "@/i18n";
import { getErrorMessage } from "@/lib/errors";
import type { Dictionary } from "@/i18n";

type Step =
  | { type: "select" }
  | { type: "email-input" }
  | { type: "email-sent"; email: string }
  | { type: "email-code-input" }
  | { type: "email-code-verify"; email: string }
  | { type: "phone-input" }
  | { type: "phone-code"; phone: string }
  | { type: "password-input" };

class GoogleErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function GoogleLoginButton({
  onSuccess,
  label,
}: {
  onSuccess: (accessToken: string) => void;
  label: string;
}) {
  const googleLogin = useGoogleLogin({
    onSuccess: (res) => onSuccess(res.access_token),
    onError: () => {},
  });

  return (
    <button
      onClick={() => googleLogin()}
      className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export function LoginModal() {
  const { loginModalOpen } = useAuth();
  if (!loginModalOpen) return null;
  return <LoginModalContent />;
}

function LoginModalContent() {
  const [step, setStep] = useState<Step>({ type: "select" });
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const {
    loginModalOpen,
    closeLoginModal,
    initiateAuth,
    completeAuth,
    isAuthenticated,
  } = useAuth();
  const navigate = useNavigate();
  const dict = useDictionary().auth;
  const common = useDictionary().common;

  useEffect(() => {
    if (!loginModalOpen) {
      setStep({ type: "select" });
      setEmail("");
      setPhone("");
      setCode("");
      setPassword("");
      setError("");
      setIsLoading(false);
    }
  }, [loginModalOpen]);

  useEffect(() => {
    if (isAuthenticated) closeLoginModal();
  }, [isAuthenticated, closeLoginModal]);

  useEffect(() => {
    if (!loginModalOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLoginModal();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [loginModalOpen, closeLoginModal]);

  function translateAuthError(raw: string, authDict: Dictionary["auth"]): string {
    if (raw.startsWith("Unknown auth provider")) return authDict.unknownAuthProvider;

    const map: Record<string, string> = {
      "No account found. Please contact your administrator to create one.": authDict.registrationDisabled,
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
      "Phone number is required": authDict.phoneRequired,
      "Phone and code are required": authDict.phoneRequired,
      "Token is required": authDict.invalidOrExpiredLink,
    };

    return map[raw] ?? raw;
  }

  const withLoading = useCallback(async (fn: () => Promise<void>) => {
    setError("");
    setIsLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(translateAuthError(getErrorMessage(e), dict));
    } finally {
      setIsLoading(false);
    }
  }, [dict]);

  const handleGoogleSuccess = (accessToken: string) =>
    withLoading(async () => {
      await completeAuth("google", { accessToken });
      navigate("/dashboard");
    });

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    withLoading(async () => {
      await initiateAuth("email", { email: cleanEmail });
      setStep({ type: "email-sent", email: cleanEmail });
    });
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.trim();
    withLoading(async () => {
      await initiateAuth("phone", { phone: cleanPhone });
      setStep({ type: "phone-code", phone: cleanPhone });
    });
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step.type !== "phone-code") return;
    withLoading(async () => {
      await completeAuth("phone", { phone: step.phone, code });
      navigate("/dashboard");
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    const isEmail = trimmed.includes("@");
    const identifier = isEmail ? trimmed.toLowerCase() : trimmed;
    withLoading(async () => {
      await completeAuth("password", {
        [isEmail ? "email" : "phone"]: identifier,
        password,
      });
      navigate("/dashboard");
    });
  };

  const handleEmailCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    withLoading(async () => {
      await initiateAuth("email-code", { email: cleanEmail });
      setStep({ type: "email-code-verify", email: cleanEmail });
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) closeLoginModal(); }}
    >
      <div className="relative flex w-full max-w-4xl overflow-hidden bg-white shadow-2xl rounded-2xl">
        <button
          onClick={closeLoginModal}
          className="absolute z-10 p-2 text-gray-400 transition-colors top-4 right-4 hover:text-black"
          aria-label={common.close}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="hidden w-1/2 bg-gray-100 md:block">
          <img src="/images/login.gif" alt={dict.loginImageAlt} className="object-cover w-full h-full" />
        </div>

        <div className="flex flex-col justify-center w-full p-8 md:w-1/2 lg:p-12">
          <div className="mb-8 text-center">
            <h4 className="text-2xl font-bold text-gray-800">{dict.welcomeBack}</h4>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {step.type === "select" && (
            <div className="space-y-4">
              <button
                onClick={() => setStep({ type: "email-input" })}
                className="flex items-center justify-center w-full py-3 space-x-2 text-white transition-all bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-md font-medium"
              >
                <span>✉️</span>
                <span>{dict.loginWithEmail}</span>
              </button>

              <button
                onClick={() => setStep({ type: "email-code-input" })}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <span>🔢</span> {dict.continueWithEmailCode}
              </button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-gray-200" />
                <span className="flex-shrink mx-4 text-sm text-gray-400">{dict.orUse}</span>
                <div className="flex-grow border-t border-gray-200" />
              </div>

              <GoogleErrorBoundary>
                <GoogleLoginButton
                  onSuccess={handleGoogleSuccess}
                  label={dict.continueWithGoogle}
                />
              </GoogleErrorBoundary>

              <button
                onClick={() => setStep({ type: "phone-input" })}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <span>📱</span> {dict.continueWithPhone}
              </button>

              <button
                onClick={() => setStep({ type: "password-input" })}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <span>🔑</span> {dict.signInWithPassword}
              </button>
            </div>
          )}

          {step.type === "email-input" && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-2">
                  {common.emailAddress}
                </label>
                <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  required autoFocus
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder={common.emailPlaceholder} />
              </div>
              <button type="submit" disabled={isLoading}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {isLoading ? common.sending : common.sendMagicLink}
              </button>
              <button type="button" onClick={() => setStep({ type: "select" })}
                className="w-full text-sm text-gray-500 hover:text-gray-700">
                {common.back}
              </button>
            </form>
          )}

          {step.type === "email-sent" && (
            <div className="text-center space-y-4">
              <div className="text-5xl">✉️</div>
              <p className="text-gray-700">{dict.magicLinkSentTo} <strong>{step.email}</strong>.</p>
              <p className="text-sm text-gray-500">{dict.checkInbox}</p>
              <button onClick={() => setStep({ type: "select" })}
                className="text-sm text-indigo-600 hover:underline">
                {common.useDifferentMethod}
              </button>
            </div>
          )}

          {step.type === "email-code-input" && (
            <form onSubmit={handleEmailCodeSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email-code" className="block text-sm font-medium text-gray-700 mb-2">
                  {common.emailAddress}
                </label>
                <input id="login-email-code" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  required autoFocus
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder={common.emailPlaceholder} />
              </div>
              <button type="submit" disabled={isLoading}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {isLoading ? common.sending : common.sendVerificationCode}
              </button>
              <button type="button" onClick={() => setStep({ type: "select" })}
                className="w-full text-sm text-gray-500 hover:text-gray-700">
                {common.back}
              </button>
            </form>
          )}

          {step.type === "email-code-verify" && (
            <form onSubmit={handleEmailCodeVerify} className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                {dict.enter4DigitCode} <strong>{step.email}</strong>
              </p>
              <input type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required autoFocus
                className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="0000" />
              <button type="submit" disabled={isLoading || code.length !== 4}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {isLoading ? common.verifying : common.verifyCode}
              </button>
              <button type="button" onClick={() => { setCode(""); setStep({ type: "email-code-input" }); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700">
                {common.resendCode}
              </button>
            </form>
          )}

          {step.type === "phone-input" && (
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-phone" className="block text-sm font-medium text-gray-700 mb-2">
                  {common.phoneNumber}
                </label>
                <input id="login-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  required autoFocus
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="+1 555 000 0000" />
              </div>
              <button type="submit" disabled={isLoading}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {isLoading ? common.sending : common.sendCode}
              </button>
              <button type="button" onClick={() => setStep({ type: "select" })}
                className="w-full text-sm text-gray-500 hover:text-gray-700">
                {common.back}
              </button>
            </form>
          )}

          {step.type === "phone-code" && (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                {dict.enter6DigitCode} <strong>{step.phone}</strong>
              </p>
              <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required autoFocus
                className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="000000" />
              <button type="submit" disabled={isLoading || code.length !== 6}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {isLoading ? common.verifying : common.verifyCode}
              </button>
              <button type="button" onClick={() => setStep({ type: "phone-input" })}
                className="w-full text-sm text-gray-500 hover:text-gray-700">
                {common.resendCode}
              </button>
            </form>
          )}

          {step.type === "password-input" && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-password-identifier" className="block text-sm font-medium text-gray-700 mb-2">
                  {common.emailOrPhone}
                </label>
                <input id="login-password-identifier" type="text" value={email} onChange={(e) => setEmail(e.target.value)}
                  required autoFocus
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder={common.emailOrPhone} />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-2">
                  {common.password}
                </label>
                <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder={common.passwordPlaceholder} />
              </div>
              <button type="submit" disabled={isLoading || !email || !password}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {isLoading ? common.signingIn : common.signIn}
              </button>
              <button type="button" onClick={() => setStep({ type: "select" })}
                className="w-full text-sm text-gray-500 hover:text-gray-700">
                {common.back}
              </button>
            </form>
          )}

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-600">
              {dict.noAccountYet}{" "}
              <span className="font-semibold text-indigo-600 cursor-pointer hover:underline">
                {dict.freeSignUp}
              </span>
            </p>
            <div className="mt-6 space-y-1 text-[11px] leading-tight text-gray-400">
              <p>{dict.ageConfirmation} <span className="font-bold text-red-400">{dict.age18Plus}</span>.</p>
              <p>
                {dict.dataProtectionConsent}{" "}
                <a href="/data-protection" className="underline hover:text-gray-600">{common.dataProtection}</a>{" "}
                and{" "}
                <a href="/privacy-policy" className="underline hover:text-gray-600">{common.privacyPolicy}</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
