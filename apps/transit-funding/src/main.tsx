import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initLabsAnalytics } from '@lvbt/brand/analytics';
import { App } from './App.tsx';
import './ui/app.css';

if (import.meta.env.PUBLIC_LVBT_CWA_TOKEN) void initLabsAnalytics();

const root = document.getElementById('root');
if (!root) throw new Error('no #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
