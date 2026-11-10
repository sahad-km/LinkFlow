import React, { useRef } from "react";
import { X, Download, Copy, Check } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

export default function QrModal({ isOpen, onClose, shortUrl, shortCode, showToast }) {
  const qrRef = useRef(null);
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !shortUrl) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    showToast("URL copied to clipboard", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;

    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `linkflow-${shortCode || "qr"}.png`;
    a.click();
    showToast("QR code downloaded as PNG", "success");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content qr-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <X size={16} />
        </button>

        <div className="modal-header text-center">
          <h2 className="modal-title">QR Code</h2>
          <p className="modal-subtitle">
            Scan with your phone to open the destination link.
          </p>
        </div>

        {/* QR Code Container */}
        <div className="qr-box" ref={qrRef}>
          <QRCodeCanvas
            value={shortUrl}
            size={190}
            bgColor="#ffffff"
            fgColor="#0a0d14"
            level="H"
            includeMargin={true}
          />
        </div>

        <div className="qr-link-display">
          <span className="qr-link-text">{shortUrl}</span>
        </div>

        {/* Actions */}
        <div className="qr-actions">
          <button className="btn-secondary flex-1" onClick={handleDownload}>
            <Download size={15} />
            <span>Download PNG</span>
          </button>
          <button className={`btn-primary flex-1 ${copied ? "copied" : ""}`} onClick={handleCopy}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            <span>{copied ? "Copied" : "Copy Link"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
