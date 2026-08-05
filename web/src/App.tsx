import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { DIProvider } from "@/di/container";
import { AuthProvider } from "@/context/AuthContext";
import { PageTitleProvider } from "@/context/PageTitleContext";
import { LanguageProvider } from "@/i18n";
import { PWAProvider } from "@/context/PWAContext";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { Router } from "@/routes/Router";

export function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""}>
      <BrowserRouter>
        <DIProvider>
          <LanguageProvider>
            <PWAProvider>
              <AuthProvider>
                <PageTitleProvider>
                  <UpdatePrompt />
                  <Router />
                </PageTitleProvider>
              </AuthProvider>
            </PWAProvider>
          </LanguageProvider>
        </DIProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
