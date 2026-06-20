import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { DIProvider } from "@/di/container";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/i18n";
import { Router } from "@/routes/Router";

export function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""}>
      <BrowserRouter>
        <DIProvider>
          <LanguageProvider>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </LanguageProvider>
        </DIProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
