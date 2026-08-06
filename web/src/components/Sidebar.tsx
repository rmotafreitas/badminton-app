import { useLocation, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePWA } from "@/hooks/usePWA";
import { useDictionary } from "@/i18n";

function isActivePath(current: string, path: string) {
  if (current === path) return true;
  if (path !== "/" && current.startsWith(path + "/")) return true;
  return false;
}

function closeMobileSidebar() {
  document.documentElement.classList.remove("aside-mobile-expanded");
}

export function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const dict = useDictionary().sidebar;
  const pwaDict = useDictionary().pwa;
  const { canInstall, installApp } = usePWA();

  const linkClass = (path: string) =>
    isActivePath(location.pathname, path) ? "active" : "";

  return (
    <>
      <aside className="aside is-placed-left is-expanded">
        <div className="aside-tools">
          <div>
            {dict.brandName} <b className="font-black">{dict.brandApp}</b>
          </div>
        </div>
        <div className="menu is-menu-main">
          <p className="menu-label">{dict.general}</p>
          <ul className="menu-list">
            <li className={linkClass("/dashboard")}>
              <Link to="/dashboard" onClick={closeMobileSidebar}>
                <span className="icon"><i className="mdi mdi-desktop-mac"></i></span>
                <span className="menu-item-label">{dict.dashboard}</span>
              </Link>
            </li>
          </ul>
          <p className="menu-label">{dict.management}</p>
          <ul className="menu-list">
            <li className={linkClass("/games")}>
              <Link to="/games" onClick={closeMobileSidebar}>
                <span className="icon"><i className="mdi mdi-badminton"></i></span>
                <span className="menu-item-label">{dict.games}</span>
              </Link>
            </li>
            <li className={linkClass("/training-review")}>
              <Link to="/training-review" onClick={closeMobileSidebar}>
                <span className="icon"><i className="mdi mdi-clipboard-text-clock"></i></span>
                <span className="menu-item-label">{dict.trainingReview}</span>
              </Link>
            </li>
            <li className={linkClass("/users")}>
              <Link to="/users" onClick={closeMobileSidebar}>
                <span className="icon"><i className="mdi mdi-account-multiple"></i></span>
                <span className="menu-item-label">{dict.users}</span>
              </Link>
            </li>
            {user?.roles?.includes("SYSTEM_ADMIN") && (
              <li className={linkClass("/clubs")}>
                <Link to="/clubs" onClick={closeMobileSidebar}>
                  <span className="icon"><i className="mdi mdi-home-group"></i></span>
                  <span className="menu-item-label">{dict.clubs}</span>
                </Link>
              </li>
            )}
          </ul>
          <p className="menu-label">{dict.settings}</p>
          <ul className="menu-list">
            <li className={linkClass("/profile")}>
              <Link to="/profile" onClick={closeMobileSidebar}>
                <span className="icon"><i className="mdi mdi-account-circle"></i></span>
                <span className="menu-item-label">{dict.profile}</span>
              </Link>
            </li>
            {canInstall && (
              <li>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    installApp();
                    closeMobileSidebar();
                  }}
                >
                  <span className="icon"><i className="mdi mdi-download"></i></span>
                  <span className="menu-item-label">{pwaDict.installApp}</span>
                </a>
              </li>
            )}
            <li>
              <Link to="/logout" onClick={closeMobileSidebar}>
                <span className="icon"><i className="mdi mdi-logout"></i></span>
                <span className="menu-item-label">{dict.logout}</span>
              </Link>
            </li>
          </ul>
        </div>
      </aside>

      {/* Mobile overlay */}
      <div
        className="sidebar-overlay fixed inset-0 bg-foreground/50 z-40 lg:hidden"
        onClick={closeMobileSidebar}
        aria-hidden="true"
      />
    </>
  );
}
