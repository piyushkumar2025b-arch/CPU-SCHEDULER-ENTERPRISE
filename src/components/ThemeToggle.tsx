import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <button
      type="button"
      id="theme-toggle-btn"
      onClick={toggleTheme}
      aria-label={`Switch to ${isLight ? 'Dark' : 'Light'} theme`}
      title={`Switch to ${isLight ? 'Dark' : 'Light'} theme`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        background: 'var(--surface-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '0.4rem 0.75rem',
        color: 'var(--text)',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: '0.78rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      {isLight ? (
        <>
          <Sun size={14} style={{ color: '#d97706' }} />
          <span>Light Mode</span>
        </>
      ) : (
        <>
          <Moon size={14} style={{ color: '#60a5fa' }} />
          <span>Dark Mode</span>
        </>
      )}
    </button>
  );
};

