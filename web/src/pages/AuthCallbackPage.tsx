import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDictionary } from "@/i18n";
import type { AuthProvider } from "@/core/domain/auth";

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { completeAuth } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const dict = useDictionary().auth;
  const common = useDictionary().common;

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get("token");
      const provider = searchParams.get("provider") || "email";

      if (!token) {
        setError(dict.invalidToken);
        return;
      }

      try {
        await completeAuth(provider as AuthProvider, { token });
        navigate("/dashboard");
      } catch {
        setError(dict.invalidToken);
      }
    };

    handleCallback();
  }, [searchParams, completeAuth, navigate, dict]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="text-red-600 font-semibold">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <div className="text-2xl font-semibold text-gray-700">
          {dict.signingYouIn}
        </div>
        <p className="text-gray-500 mt-2">{common.pleaseWait}</p>
      </div>
    </div>
  );
}
