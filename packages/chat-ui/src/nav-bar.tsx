interface NavBarProps {
  model: string;
  connected: boolean;
  logoSrc?: string;
}

export function NavBar({
  model,
  connected,
  logoSrc = "/assets/logo.jpg"
}: NavBarProps) {
  return (
    <header className="navbar">
      <div className="navbar-brand">
        <img src={logoSrc} className="navbar-logo" alt="SelfMe Logo" />
        <div className="navbar-info">
          <div className="navbar-title">SELFME</div>
        </div>
      </div>

      <div className="navbar-status">
        <div className={`navbar-pill ${connected ? "navbar-pill-success" : "navbar-pill-warning"}`.trim()}>
          <span className={`navbar-pill-dot ${connected ? "navbar-pill-dot-success" : "navbar-pill-dot-warning"}`.trim()} />
          {connected ? "Connected" : "Reconnecting"}
        </div>
        <div className="navbar-pill navbar-pill-model">
          <span className="navbar-pill-model-label">Model:</span>
          <span className="navbar-pill-model-value">{model}</span>
        </div>
      </div>
    </header>
  );
}
