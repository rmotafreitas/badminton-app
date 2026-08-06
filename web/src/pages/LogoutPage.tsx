import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDictionary } from "@/i18n";

export function LogoutPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const dict = useDictionary().auth;

  useEffect(() => {
    // logout() clears local state synchronously and fires the
    // server cookie-clear in the background — no awaiting needed.
    logout();
    navigate("/");
  }, [logout, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <div className="text-2xl font-semibold text-foreground">
          {dict.signingYouOut}
        </div>
        <p className="text-muted-foreground mt-2">{dict.logoutDesc}</p>
      </div>
    </div>
  );
}