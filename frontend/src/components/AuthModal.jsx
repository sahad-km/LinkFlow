import React, { useState } from "react";
import { X, Lock, Mail, User, ArrowRight, RefreshCw } from "lucide-react";
import { api } from "../api";

export default function AuthModal({ isOpen, onClose, onAuthSuccess, showToast }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password || (isRegister && !name)) {
      setError("Please fill out all required fields.");
      return;
    }

    try {
      setLoading(true);
      let res;
      if (isRegister) {
        res = await api.register(name, email, password);
        showToast("Account created successfully", "success");
      } else {
        res = await api.login(email, password);
        showToast("Signed in successfully", "success");
      }

      if (res.user) {
        onAuthSuccess(res.user);
        onClose();
        setName("");
        setEmail("");
        setPassword("");
      }
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <X size={16} />
        </button>

        <div className="modal-header">
          <h2 className="modal-title">
            {isRegister ? "Create an account" : "Sign in to LinkFlow"}
          </h2>
          <p className="modal-subtitle">
            {isRegister
              ? "Save and organize your links with click tracking across all devices."
              : "Access your saved links, custom aliases, and metrics."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error-banner">{error}</div>}

          {isRegister && (
            <div className="auth-field">
              <label className="auth-label">Name</label>
              <div className="auth-input-wrapper">
                <User size={15} className="auth-input-icon" />
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label">Email</label>
            <div className="auth-input-wrapper">
              <Mail size={15} className="auth-input-icon" />
              <input
                type="email"
                className="auth-input"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className="auth-input-wrapper">
              <Lock size={15} className="auth-input-icon" />
              <input
                type="password"
                className="auth-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-primary w-full mt-4" disabled={loading}>
            {loading ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                <span>Please wait...</span>
              </>
            ) : (
              <>
                <span>{isRegister ? "Create Account" : "Sign In"}</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <span>{isRegister ? "Already have an account?" : "Need an account?"}</span>
          <button
            type="button"
            className="toggle-auth-btn"
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
          >
            {isRegister ? "Sign In" : "Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
