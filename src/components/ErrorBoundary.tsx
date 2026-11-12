import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main role="alert" className="p-6">
        <h1>No se pudo mostrar esta pantalla</h1>
        <p>No se borraron tus datos. Recarga para intentar recuperar la sesión.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Recargar aplicación
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
