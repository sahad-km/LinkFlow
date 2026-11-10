import React, { useState } from "react";
import { Link2, ArrowRight, Copy, Check, ExternalLink, QrCode, Sliders, RefreshCw } from "lucide-react";
import { api } from "../api";

export default function UrlShortener({ onLinkCreated, onOpenQr, showToast }) {
  const [longUrl, setLongUrl] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [title, setTitle] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!longUrl.trim()) {
      showToast("Please enter a valid URL", "error");
      return;
    }

    let formattedUrl = longUrl.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = "https://" + formattedUrl;
    }

    try {
      setLoading(true);
      const res = await api.createUrl({
        longUrl: formattedUrl,
        customCode: customCode.trim() ? customCode.trim() : undefined,
        title: title.trim() ? title.trim() : undefined,
      });

      if (res.success && res.data) {
        setResult(res.data);
        onLinkCreated(res.data);
        showToast("Short link created successfully", "success");
        setLongUrl("");
        setCustomCode("");
        setTitle("");
        setShowAdvanced(false);
      }
    } catch (err) {
      showToast(err.message || "Failed to create short URL", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (urlToCopy) => {
    navigator.clipboard.writeText(urlToCopy);
    setCopied(true);
    showToast("Copied to clipboard", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLongUrl(text);
      }
    } catch {
      // Permission denied
    }
  };

  return (
    <div className="shortener-wrapper">
      {/* Hero section with clean, human copy */}
      <div className="hero-content">
        <h1 className="hero-title">The modern URL shortener.</h1>
        <p className="hero-subtitle">
          Create clean, reliable short links in seconds. Customize your alias, track clicks, and enjoy instant redirection.
        </p>
      </div>

      {/* Main Shortener Card */}
      <div className="shortener-card">
        <form onSubmit={handleSubmit} className="shortener-form">
          <div className="input-group-main">
            <div className="input-icon">
              <Link2 size={18} />
            </div>
            <input
              type="text"
              className="url-input"
              placeholder="Paste a long URL (e.g. https://example.com/blog/my-post...)"
              value={longUrl}
              onChange={(e) => setLongUrl(e.target.value)}
              disabled={loading}
              required
            />
            {!longUrl && (
              <button type="button" className="paste-btn" onClick={handlePaste}>
                Paste
              </button>
            )}
            <button type="submit" className="btn-primary submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Shortening...</span>
                </>
              ) : (
                <>
                  <span>Shorten URL</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>

          {/* Collapsible Options */}
          <div className="advanced-toggle">
            <button
              type="button"
              className="toggle-btn mt"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Sliders size={14} />
              <span>{showAdvanced ? "Fewer options" : "Custom alias & title"}</span>
            </button>
          </div>

          {showAdvanced && (
            <div className="advanced-fields">
              <div className="field-group">
                <label className="field-label">Custom Back-Half (Alias)</label>
                <div className="alias-input-wrapper">
                  <span className="alias-prefix">localhost:8000/</span>
                  <input
                    type="text"
                    className="alias-input"
                    placeholder="custom-slug"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value)}
                    maxLength={30}
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Link Title</label>
                <input
                  type="text"
                  className="title-input"
                  placeholder="e.g. Portfolio launch"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Generated Result Card */}
      {result && (
        <div className="result-card">
          <div className="result-header">
            <div className="result-status">
              <span className="badge-pill badge-green">Ready</span>
              <span className="short-code-tag">{result.shortCode}</span>
            </div>
            <div className="result-actions">
              <button
                className="btn-secondary btn-sm"
                onClick={() => onOpenQr(result.shortUrl, result.shortCode)}
              >
                <QrCode size={14} />
                <span>QR Code</span>
              </button>
            </div>
          </div>

          <div className="result-body">
            <div className="short-url-box">
              <a
                href={result.shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="short-url-link"
              >
                {result.shortUrl}
                <ExternalLink size={13} className="link-ext-icon" />
              </a>
              <button
                className={`btn-copy ${copied ? "copied" : ""}`}
                onClick={() => handleCopy(result.shortUrl)}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>

            <div className="destination-preview">
              <span className="dest-label">Redirects to:</span>
              <span className="dest-url" title={result.longUrl}>
                {result.longUrl}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
