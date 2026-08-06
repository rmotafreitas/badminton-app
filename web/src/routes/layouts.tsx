import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Sidebar } from "@/components/Sidebar";
import { LoginModal } from "@/components/LoginModal";
import { AddToHomeScreenTip } from "@/components/AddToHomeScreenTip";

interface LayoutProps {
  children: React.ReactNode;
}

export function LayoutApp({ children }: LayoutProps) {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main style={{ paddingTop: "calc(3.5rem + env(safe-area-inset-top))" }} className="flex-1">{children}</main>
      <Footer />
      <LoginModal />
    </div>
  );
}

export function LayoutLogin({ children }: LayoutProps) {
  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center p-0 sm:p-4"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {children}
    </div>
  );
}

export function LayoutAdmin({ children }: LayoutProps) {
  return (
    <div id="app" className="has-aside">
      <Navbar />
      <Sidebar />
      {children}
      <AddToHomeScreenTip />
    </div>
  );
}
