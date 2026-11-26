import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/im-fell-english/latin-400.css';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-600.css';
import './sandbox.css';
import { Sandbox } from './Sandbox';

createRoot(document.getElementById('root')!).render(<StrictMode><Sandbox /></StrictMode>);
