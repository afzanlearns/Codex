import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const theme = localStorage.getItem('codex_theme');
const preferredTheme = theme === 'light' || theme === 'dark'
  ? theme
  : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

document.documentElement.dataset.theme = preferredTheme;
document.documentElement.style.colorScheme = preferredTheme;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
