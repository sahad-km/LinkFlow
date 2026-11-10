import React, { useState, useEffect } from "react";
import "./App.css";
import Navbar from "./components/Navbar";
import UrlShortener from "./components/UrlShortener";
import MyLinks from "./components/MyLinks";
import AuthModal from "./components/AuthModal";
import QrModal from "./components/QrModal";
import AnalyticsModal from "./components/AnalyticsModal";
import { api, getUser, getToken } from "./api";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState("shortener");
  const [user, setUser] = useState(getUser());
  const [localLinks, setLocalLinks] = useState(() => {
    try {
      const saved = localStorage.getItem("linkflow_local_links");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [qrModal, setQrModal] = useState({ isOpen: false, shortUrl: "", shortCode: "" });
  const [analyticsModal, setAnalyticsModal] = useState({ isOpen: false, shortUrl: "", shortCode: "" });
  const [toasts, setToasts] = useState([]);

  // Verify active user session on boot
  useEffect(() => {
    if (getToken()) {
      api.getMe()
        .then((res) => {
          if (res.user) setUser(res.user);
        })
        .catch(() => {
          setUser(null);
        });
    }
  }, []);

  const showToast = (message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const handleLinkCreated = (newUrl) => {
    setLocalLinks((prev) => {
      const updated = [newUrl, ...prev];
      localStorage.setItem("linkflow_local_links", JSON.stringify(updated));
      return updated;
    });
  };

  const handleOpenQr = (shortUrl, shortCode) => {
    setQrModal({ isOpen: true, shortUrl, shortCode });
  };

  const handleOpenAnalytics = (shortCode, shortUrl) => {
    setAnalyticsModal({ isOpen: true, shortCode, shortUrl });
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    showToast("Signed out successfully", "info");
  };

  return (
    <div className="app-layout">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === "shortener" && (
          <UrlShortener
            onLinkCreated={handleLinkCreated}
            onOpenQr={handleOpenQr}
            showToast={showToast}
          />
        )}

        {activeTab === "mylinks" && (
          <MyLinks
            user={user}
            onOpenAuth={() => setIsAuthOpen(true)}
            onOpenQr={handleOpenQr}
            onOpenAnalytics={handleOpenAnalytics}
            showToast={showToast}
            localLinks={localLinks}
          />
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(userData) => setUser(userData)}
        showToast={showToast}
      />

      {/* QR Code Modal */}
      <QrModal
        isOpen={qrModal.isOpen}
        onClose={() => setQrModal({ isOpen: false, shortUrl: "", shortCode: "" })}
        shortUrl={qrModal.shortUrl}
        shortCode={qrModal.shortCode}
        showToast={showToast}
      />

      {/* Analytics Modal */}
      <AnalyticsModal
        isOpen={analyticsModal.isOpen}
        onClose={() => setAnalyticsModal({ isOpen: false, shortUrl: "", shortCode: "" })}
        shortCode={analyticsModal.shortCode}
        shortUrl={analyticsModal.shortUrl}
      />

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.type === "success" && <CheckCircle2 size={15} className="text-green" />}
            {t.type === "error" && <AlertCircle size={15} className="text-rose" />}
            {t.type === "info" && <Info size={15} className="text-blue" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
