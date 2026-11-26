import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/im-fell-english/latin-400.css';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-600.css';
import './sandbox.css';
import { Sandbox } from './Sandbox';

/** Anything unexpected shows a way back instead of a blank page. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <main className="sb"><h1>Deadlock 1916</h1><p className="sb-notice">Something in this setup could not be loaded.</p><p><a href={location.pathname}>Start again with the default setup</a></p></main>
      : this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<StrictMode><Boundary><Sandbox /></Boundary></StrictMode>);
