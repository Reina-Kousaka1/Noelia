import React from "react";
import type { SectionId } from "../screens/section";

type NavigationItem = {
  id: SectionId;
  label: string;
  icon: string;
};

type FutureItem = {
  label: string;
  icon: string;
};

const mainItems: NavigationItem[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "academy", label: "Academy", icon: "academy" },
  { id: "training", label: "Training", icon: "training" },
  { id: "wardrobe", label: "Wardrobe", icon: "wardrobe" },
  { id: "profile", label: "Profile", icon: "profile" },
];

const futureItems: FutureItem[] = [
  { label: "Boutique", icon: "boutique" },
  { label: "Schedule", icon: "schedule" },
  { label: "Report Cards", icon: "report" },
];

const iconPaths: Record<string, React.ReactNode> = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
  academy: <><path d="M12 3 4 7v5c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7l-8-4Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
  training: <><path d="M4 19V5M20 19V5M4 8h4v8H4m12-8h4v8h-4M8 12h8" /></>,
  wardrobe: <><path d="M12 4a3 3 0 0 0-3 3c0 1.2.7 2.2 1.7 2.7L4 14v5h16v-5l-6.7-4.3A3 3 0 0 0 15 7a3 3 0 0 0-3-3Z" /><path d="M4 16h16" /></>,
  profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.4 3.1-5.2 7-5.2s6.2 1.8 7 5.2" /></>,
  boutique: <><path d="M4 9h16l-1 11H5L4 9Z" /><path d="M8 9a4 4 0 0 1 8 0M4 12h16" /></>,
  schedule: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16m-11 4h2m3 0h2m-7 3h2" /></>,
  report: <><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M8 12h8m-8 4h8" /></>,
};

const NavIcon: React.FC<{ name: string }> = ({ name }) => (
  <svg
    className="nav-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {iconPaths[name]}
  </svg>
);

type NavigationProps = {
  activeSection: SectionId;
  onNavigate: (section: SectionId) => void;
};

const PrimaryLinks: React.FC<NavigationProps & { compact?: boolean }> = ({
  activeSection,
  onNavigate,
  compact = false,
}) => (
  <>
    {mainItems.map((item) => (
      <button
        className={`nav-link ${activeSection === item.id ? "nav-link-active" : ""} ${compact ? "nav-link-compact" : ""}`}
        type="button"
        key={item.id}
        onClick={() => onNavigate(item.id)}
        aria-current={activeSection === item.id ? "page" : undefined}
      >
        <NavIcon name={item.icon} />
        <span>{item.label}</span>
      </button>
    ))}
  </>
);

const Brand: React.FC = () => (
  <div className="app-brand" aria-label="Noélia Academy">
    <span className="app-brand-mark" aria-hidden="true">N</span>
    <span className="app-brand-copy">
      <strong>Noélia</strong>
      <small>ACADEMY</small>
    </span>
  </div>
);

export const SideNavigation: React.FC<NavigationProps> = ({
  activeSection,
  onNavigate,
}) => (
  <aside className="side-navigation">
    <Brand />
    <div className="nav-caption">YOUR STUDIO</div>
    <nav className="side-links" aria-label="Main navigation">
      <PrimaryLinks activeSection={activeSection} onNavigate={onNavigate} />
    </nav>
    <div className="nav-caption nav-caption-later">COMING TO THE STUDIO</div>
    <nav className="side-links future-links" aria-label="Coming soon">
      {futureItems.map((item) => (
        <button
          className="nav-link nav-link-disabled"
          type="button"
          key={item.label}
          disabled
          aria-label={`${item.label}, coming soon`}
        >
          <NavIcon name={item.icon} />
          <span>{item.label}</span>
          <span className="soon-dot" aria-hidden="true">·</span>
        </button>
      ))}
    </nav>
    <div className="sidebar-note">
      <span aria-hidden="true">✧</span>
      <p>One graceful step at a time.</p>
    </div>
  </aside>
);

export const MobileNavigation: React.FC<NavigationProps> = (props) => (
  <nav className="mobile-navigation" aria-label="Main navigation">
    <PrimaryLinks {...props} compact />
  </nav>
);

export const AppHeader: React.FC<{ activeTitle: string }> = ({ activeTitle }) => (
  <header className="app-header">
    <div className="mobile-brand"><Brand /></div>
    <div className="header-section-name">{activeTitle}</div>
    <div className="header-presence">
      <span className="presence-dot" />
      <span>Madame is here</span>
    </div>
  </header>
);
