import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="app-layout">
      <header className="app-header">
        <Link to="/" className="app-header__logo">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="4" fill="#3B82F6" />
            <path
              d="M8 10h16M8 16h16M8 22h12"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="25" cy="22" r="3" fill="#10B981" />
          </svg>
          API Contract Platform
        </Link>
        <nav className="app-header__nav">
          <Link to="/">Services</Link>
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
