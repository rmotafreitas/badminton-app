import { Link, useLocation, useSearchParams, matchPath } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/context/PageTitleContext";
import { useDictionary } from "@/i18n";
import { protectedRoutes } from "@/routes/routes.config";
import { fallbackAvatar } from "@/lib/avatar-utils";
import { useMemo, useState } from "react";

export function Navbar() {
  const { user, openLoginModal, logout } = useAuth();
  const dict = useDictionary();
  const nav = dict.nav;
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pageTitle: dynamicTitle } = usePageTitle();

  const routeTitle = useMemo(() => {
    const route = protectedRoutes.find((r) => matchPath(r.path, location.pathname));
    return route?.getTitle?.(dict, searchParams) ?? "";
  }, [location.pathname, dict, searchParams]);

  const pageTitle = dynamicTitle || routeTitle;

  return (
    <nav id="navbar-main" className="navbar is-fixed-top">
      <div className="navbar-brand">
        <a className="navbar-item mobile-aside-button" onClick={() => document.documentElement.classList.toggle('aside-mobile-expanded')}>
          <span className="icon"><i className="mdi mdi-forwardburger mdi-24px"></i></span>
        </a>
        {pageTitle && (
          <div className="lg:hidden flex items-center px-4">
            <div className="flex items-center gap-2 text-sm truncate max-w-[200px]">
              <span className="text-muted-foreground">{nav.admin}</span>
              <span className="text-border">/</span>
              <span className="font-bold text-foreground">{pageTitle}</span>
            </div>
          </div>
        )}
      </div>
      <div className="navbar-brand is-right">
        <a className="navbar-item --jb-navbar-menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
          <span className="icon"><i className="mdi mdi-dots-vertical mdi-24px"></i></span>
        </a>
      </div>
      <div className={`navbar-menu ${menuOpen ? "active" : ""}`} id="navbar-menu">
        {pageTitle && (
          <div className="navbar-start hidden lg:flex items-center px-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{nav.admin}</span>
              <span className="text-border">/</span>
              <span className="font-bold text-foreground">{pageTitle}</span>
            </div>
          </div>
        )}
        <div className="navbar-end">
          {user ? (
            <div className="navbar-item dropdown has-divider has-user-avatar group hover:is-active">
              <a className="navbar-link">
                <div className="user-avatar">
                  <img src={fallbackAvatar(null, user.email, user.userId)} alt={user.email ?? undefined} className="rounded-full" />
                </div>
                <div className="is-user-name"><span>{user.email?.split("@")[0]}</span></div>
                <span className="icon"><i className="mdi mdi-chevron-down"></i></span>
              </a>
              <div className="navbar-dropdown hidden group-hover:block absolute bg-card shadow-lg rounded-b-lg border-t-2 border-border min-w-[200px] right-0 z-50">
                <Link to="/profile" className="navbar-item">
                  <span className="icon"><i className="mdi mdi-account"></i></span>
                  <span>{nav.myProfile}</span>
                </Link>
                <hr className="navbar-divider" />
                <a onClick={logout} className="navbar-item cursor-pointer">
                  <span className="icon"><i className="mdi mdi-logout"></i></span>
                  <span>{nav.logOut}</span>
                </a>
              </div>
            </div>
          ) : (
            <a onClick={openLoginModal} className="navbar-item cursor-pointer">
              <span className="icon"><i className="mdi mdi-login"></i></span>
              <span>{nav.login}</span>
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
