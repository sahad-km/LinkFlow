import React, { useEffect, useState } from "react";
import { X, BarChart3, Globe, Smartphone, Laptop, RefreshCw, Clock, ExternalLink } from "lucide-react";
import { api } from "../api";

export default function AnalyticsModal({ shortCode, shortUrl, isOpen, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAnalytics = async () => {
    if (!shortCode) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.getAnalytics(shortCode);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.message || "No analytics available");
      }
    } catch (err) {
      setError(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && shortCode) {
      fetchAnalytics();
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, shortCode]);

  if (!isOpen) return null;

  const totalClicks = data?.totalClicks || 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card glass-panel analytics-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "720px", width: "95%" }}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <BarChart3 size={20} className="text-cyan" />
            </div>
            <div>
              <h3 className="modal-title">Link Analytics</h3>
              <p className="modal-subtitle">
                Real-time streaming metrics powered by Apache Kafka
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              className="btn-icon"
              onClick={fetchAnalytics}
              disabled={loading}
              title="Refresh Analytics"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button className="modal-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ maxHeight: "75vh", overflowY: "auto", padding: "1.5rem" }}>
          {loading ? (
            <div className="loading-state" style={{ padding: "3rem 1rem", textAlign: "center" }}>
              <RefreshCw size={28} className="animate-spin text-cyan" style={{ margin: "0 auto 12px auto" }} />
              <p style={{ color: "var(--text-muted)" }}>Streaming real-time metrics...</p>
            </div>
          ) : error ? (
            <div className="error-banner" style={{ textAlign: "center", padding: "2rem" }}>
              <p style={{ color: "var(--danger)" }}>{error}</p>
              <button className="btn-secondary btn-sm" onClick={fetchAnalytics} style={{ marginTop: "1rem" }}>
                Retry
              </button>
            </div>
          ) : data ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Top Overview Bar */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                  padding: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Short Code</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: "700", color: "var(--primary-cyan)" }}>
                    /{data.shortCode}
                  </div>
                  <a
                    href={data.longUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      marginTop: "4px",
                      textDecoration: "none",
                      maxWidth: "350px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>{data.longUrl}</span>
                    <ExternalLink size={12} />
                  </a>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Total Clicks</div>
                  <div style={{ fontSize: "2rem", fontWeight: "800", color: "#38bdf8" }}>
                    {totalClicks}
                  </div>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      background: "rgba(56, 189, 248, 0.15)",
                      color: "#38bdf8",
                    }}
                  >
                    Kafka Event Synced
                  </span>
                </div>
              </div>

              {/* Grid of Breakdowns */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                {/* Devices */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "10px",
                    padding: "1rem",
                  }}
                >
                  <h4 style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Smartphone size={16} /> Device Types
                  </h4>
                  {data.devices?.length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No click data yet</p>
                  ) : (
                    data.devices.map((d) => {
                      const pct = totalClicks > 0 ? Math.round((d.count / totalClicks) * 100) : 0;
                      return (
                        <div key={d.name} style={{ marginBottom: "10px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                            <span>{d.name}</span>
                            <span style={{ color: "var(--text-muted)" }}>{d.count} ({pct}%)</span>
                          </div>
                          <div style={{ height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #06b6d4, #3b82f6)", borderRadius: "3px" }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Browsers */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "10px",
                    padding: "1rem",
                  }}
                >
                  <h4 style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Laptop size={16} /> Top Browsers
                  </h4>
                  {data.browsers?.length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No click data yet</p>
                  ) : (
                    data.browsers.map((b) => {
                      const pct = totalClicks > 0 ? Math.round((b.count / totalClicks) * 100) : 0;
                      return (
                        <div key={b.name} style={{ marginBottom: "10px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                            <span>{b.name}</span>
                            <span style={{ color: "var(--text-muted)" }}>{b.count} ({pct}%)</span>
                          </div>
                          <div style={{ height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #8b5cf6, #ec4899)", borderRadius: "3px" }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Referrers */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "10px",
                  padding: "1rem",
                }}
              >
                <h4 style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Globe size={16} /> Referrers
                </h4>
                {data.referrers?.length === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Direct navigation / No referrer headers</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {data.referrers.map((r) => (
                      <div
                        key={r.name}
                        style={{
                          background: "rgba(255, 255, 255, 0.05)",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          fontSize: "0.8rem",
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        <span>{r.name}</span>
                        <span style={{ color: "#38bdf8", fontWeight: "600" }}>{r.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Click Activity */}
              {data.recentClicks && data.recentClicks.length > 0 && (
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "10px",
                    padding: "1rem",
                  }}
                >
                  <h4 style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Clock size={16} /> Recent Click Stream
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
                    {data.recentClicks.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.8rem",
                          padding: "6px 8px",
                          background: "rgba(255, 255, 255, 0.02)",
                          borderRadius: "4px",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          {new Date(c.clicked_at).toLocaleTimeString()} ({new Date(c.clicked_at).toLocaleDateString()})
                        </span>
                        <span style={{ color: "#e2e8f0" }}>
                          {c.browser} on {c.os} ({c.device})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p style={{ textAlign: "center", color: "var(--text-muted)" }}>No data found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
