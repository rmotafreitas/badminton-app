import { useLocation, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDictionary } from "@/i18n";

export function Sidebar() {
  const { logout, user } = useAuth();
  const location = useLocation();
  const dict = useDictionary().sidebar;

  return (
    <aside className="aside is-placed-left is-expanded">
      <div className="aside-tools">
        <div>
          {dict.brandName} <b className="font-black">{dict.brandApp}</b>
        </div>
      </div>
      <div className="menu is-menu-main">
        <p className="menu-label">{dict.general}</p>
        <ul className="menu-list">
          <li className={location.pathname === "/dashboard" ? "active" : ""}>
            <Link to="/dashboard">
              <span className="icon"><i className="mdi mdi-desktop-mac"></i></span>
              <span className="menu-item-label">{dict.dashboard}</span>
            </Link>
          </li>
        </ul>
        <p className="menu-label">{dict.management}</p>
        <ul className="menu-list">
          <li className={location.pathname === "/games" ? "active" : ""}>
            <Link to="/games">
              <span className="icon"><i className="mdi mdi-badminton"></i></span>
              <span className="menu-item-label">{dict.games}</span>
            </Link>
          </li>
          <li className={location.pathname === "/users" ? "active" : ""}>
            <Link to="/users">
              <span className="icon"><i className="mdi mdi-account-multiple"></i></span>
              <span className="menu-item-label">{dict.users}</span>
            </Link>
          </li>
          {user?.roles?.includes("SYSTEM_ADMIN") && (
            <li className={location.pathname === "/clubs" ? "active" : ""}>
              <Link to="/clubs">
                <span className="icon"><i className="mdi mdi-home-group"></i></span>
                <span className="menu-item-label">{dict.clubs}</span>
              </Link>
            </li>
          )}
        </ul>
        <p className="menu-label">{dict.settings}</p>
        <ul className="menu-list">
          <li className={location.pathname === "/profile" ? "active" : ""}>
            <Link to="/profile">
              <span className="icon"><i className="mdi mdi-account-circle"></i></span>
              <span className="menu-item-label">{dict.profile}</span>
            </Link>
          </li>
          <li>
            <a onClick={logout} className="cursor-pointer">
              <span className="icon"><i className="mdi mdi-logout"></i></span>
              <span className="menu-item-label">{dict.logout}</span>
            </a>
          </li>
        </ul>
      </div>
    </aside>
  );
}
