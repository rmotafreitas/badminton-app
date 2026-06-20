import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDictionary } from "@/i18n";
import { useState } from "react";

export function Navbar() {
  const { user, openLoginModal, logout } = useAuth();
  const dict = useDictionary();
  const nav = dict.nav;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav id="navbar-main" className="navbar is-fixed-top">
      <div className="navbar-brand">
        <a className="navbar-item mobile-aside-button" onClick={() => document.documentElement.classList.toggle('m-aside-left-active')}>
          <span className="icon"><i className="mdi mdi-forwardburger mdi-24px"></i></span>
        </a>
      </div>
      <div className="navbar-brand is-right">
        <a className="navbar-item --jb-navbar-menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
          <span className="icon"><i className="mdi mdi-dots-vertical mdi-24px"></i></span>
        </a>
      </div>
      <div className={`navbar-menu ${menuOpen ? "active" : ""}`} id="navbar-menu">
        <div className="navbar-end">
          {user ? (
            <div className="navbar-item dropdown has-divider has-user-avatar group hover:is-active">
              <a className="navbar-link">
                <div className="user-avatar">
                  <img src={`https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.email ?? "user")}`} alt={user.email ?? undefined} className="rounded-full" />
                </div>
                <div className="is-user-name"><span>{user.email?.split("@")[0]}</span></div>
                <span className="icon"><i className="mdi mdi-chevron-down"></i></span>
              </a>
              <div className="navbar-dropdown hidden group-hover:block absolute bg-white shadow-lg rounded-b-lg border-t-2 border-gray-100 min-w-[200px] right-0 z-50">
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
