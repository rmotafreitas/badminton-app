import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Sidebar } from "@/components/Sidebar";
import { LoginModal } from "@/components/LoginModal";

interface LayoutProps {
  children: React.ReactNode;
}

export function LayoutApp({ children }: LayoutProps) {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <LoginModal />
    </div>
  );
}

export function LayoutLogin({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-0 sm:p-4">
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
    </div>
  );
}
