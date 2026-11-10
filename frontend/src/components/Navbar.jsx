import React from "react";
import { Link2, User, LogOut } from "lucide-react";

export default function Navbar({ activeTab, setActiveTab, user, onOpenAuth, onLogout }) {
  return (
    <header className="navbar-container">
      <div className="navbar-content">
        {/* Brand */}
        <div className="brand" onClick={() => setActiveTab("shortener")}>
          <div className="brand-icon">
            <Link2 size={19} />
          </div>
          <span className="brand-name">LinkFlow</span>
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === "shortener" ? "active" : ""}`}
            onClick={() => setActiveTab("shortener")}
          >
            <span>Shortener</span>
          </button>

          <button
            className={`nav-tab ${activeTab === "mylinks" ? "active" : ""}`}
            onClick={() => setActiveTab("mylinks")}
          >
            <span>My Links</span>
          </button>
        </nav>

        {/* Right Section: User Profile or Sign In */}
        <div className="nav-actions">
          {user ? (
            <div className="user-profile">
              <div className="user-avatar" title={user.email}>
                {user.name ? user.name[0].toUpperCase() : "U"}
              </div>
              <span className="user-name">{user.name || user.email.split("@")[0]}</span>
              <button className="btn-icon" onClick={onLogout} title="Log Out">
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button className="btn-secondary" onClick={onOpenAuth}>
              <User size={15} />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
