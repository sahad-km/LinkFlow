import React, { useState, useEffect } from "react";
import { Link2, Search, Trash2, Copy, Check, QrCode, ExternalLink, MousePointerClick, RefreshCw, User, BarChart3 } from "lucide-react";
import { api } from "../api";

export default function MyLinks({ user, onOpenAuth, onOpenQr, onOpenAnalytics, showToast, localLinks }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const fetchLinks = async () => {
    if (!user) {
      setLinks(localLinks || []);
      return;
    }

    try {
      setLoading(true);
      const res = await api.getMyUrls();
      if (res.success && res.data) {
        setLinks(res.data);
      }
    } catch (err) {
      showToast(err.message || "Failed to fetch links", "error");
      setLinks(localLinks || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, [user, localLinks]);

  const handleDelete = async (shortCode) => {
    if (!window.confirm(`Delete short link "${shortCode}"? This will invalidate the Redis cache and database record.`)) {
      return;
    }

    try {
      await api.deleteUrl(shortCode);
      setLinks((prev) => prev.filter((l) => l.shortCode !== shortCode));
      showToast("Link deleted and Redis cache evicted", "success");
    } catch (err) {
      showToast(err.message || "Failed to delete link", "error");
    }
  };

  const handleCopy = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    showToast("Link copied to clipboard", "success");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredLinks = links.filter((l) => {
    const term = searchTerm.toLowerCase();
    return (
      l.shortCode?.toLowerCase().includes(term) ||
      l.longUrl?.toLowerCase().includes(term) ||
      l.title?.toLowerCase().includes(term)
    );
  });

  const totalClicks = links.reduce((sum, l) => sum + (Number(l.clicks) || 0), 0);

  return (
    <div className="mylinks-container">
      {/* Header and stats */}
      <div className="mylinks-header">
        <div>
          <h2>My Shortened Links</h2>
          <p className="mylinks-subtitle">
            {user
              ? "All links created under your account with real-time click tracking."
              : "Showing links created in this session. Sign in to permanently sync across devices."}
          </p>
        </div>

        <div className="stats-badges">
          <div className="stat-pill">
            <span className="stat-count">{links.length}</span>
            <span className="stat-name">Total Links</span>
          </div>
          <div className="stat-pill highlight">
            <span className="stat-count">{totalClicks}</span>
            <span className="stat-name">Total Clicks</span>
          </div>
          <button className="btn-icon" onClick={fetchLinks} title="Refresh Links">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Auth Banner if guest */}
      {!user && (
        <div className="guest-banner glass-panel">
          <div className="guest-banner-text">
            <User size={18} className="guest-icon" />
            <span>Sign in to save unlimited links, track detailed analytics, and manage vanity slugs.</span>
          </div>
          <button className="btn-primary btn-sm" onClick={onOpenAuth}>
            Sign In / Register
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="search-bar-wrapper">
        <Search size={18} className="search-icon" />
        <input
          type="text"
          className="search-input"
          placeholder="Search by title, short code, or destination URL..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button className="clear-search-btn" onClick={() => setSearchTerm("")}>
            Clear
          </button>
        )}
      </div>

      {/* Links List / Table */}
      {loading ? (
        <div className="loading-state glass-panel">
          <RefreshCw size={24} className="animate-spin text-cyan" />
          <span>Loading links...</span>
        </div>
      ) : filteredLinks.length === 0 ? (
        <div className="empty-state glass-panel">
          <Link2 size={36} className="empty-icon" />
          <h3>No links found</h3>
          <p>
            {searchTerm
              ? "No links match your search query."
              : "You haven't shortened any links yet. Start by shortening a URL!"}
          </p>
        </div>
      ) : (
        <div className="links-grid">
          {filteredLinks.map((link) => (
            <div key={link.id || link.shortCode} className="link-card glass-panel">
              <div className="link-card-top">
                <div className="link-title-group">
                  <span className="link-title">{link.title || "Untitled Link"}</span>
                  <span className="link-date">
                    {link.createdAt ? new Date(link.createdAt).toLocaleDateString() : "Just now"}
                  </span>
                </div>

                <div
                  className="clicks-badge"
                  style={{ cursor: "pointer" }}
                  onClick={() => onOpenAnalytics && onOpenAnalytics(link.shortCode, link.shortUrl)}
                  title="Click to view full analytics"
                >
                  <MousePointerClick size={14} />
                  <span>{link.clicks || 0} clicks</span>
                </div>
              </div>

              <div className="link-card-middle">
                <a
                  href={link.shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card-short-url"
                >
                  <span>{link.shortUrl}</span>
                  <ExternalLink size={13} />
                </a>

                <p className="card-dest-url" title={link.longUrl}>
                  {link.longUrl}
                </p>
              </div>

              <div className="link-card-bottom">
                <div className="card-actions-left">
                  <button
                    className="btn-card-action"
                    onClick={() => handleCopy(link.shortUrl, link.id || link.shortCode)}
                    title="Copy URL"
                  >
                    {copiedId === (link.id || link.shortCode) ? (
                      <Check size={14} className="text-green" />
                    ) : (
                      <Copy size={14} />
                    )}
                    <span>{copiedId === (link.id || link.shortCode) ? "Copied" : "Copy"}</span>
                  </button>

                  <button
                    className="btn-card-action"
                    onClick={() => onOpenQr(link.shortUrl, link.shortCode)}
                    title="Show QR Code"
                  >
                    <QrCode size={14} />
                    <span>QR</span>
                  </button>

                  <button
                    className="btn-card-action"
                    onClick={() => onOpenAnalytics && onOpenAnalytics(link.shortCode, link.shortUrl)}
                    title="View Analytics"
                  >
                    <BarChart3 size={14} />
                    <span>Stats</span>
                  </button>
                </div>

                <button
                  className="btn-card-delete"
                  onClick={() => handleDelete(link.shortCode)}
                  title="Delete Link"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
