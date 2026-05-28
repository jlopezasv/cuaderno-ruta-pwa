import { Component } from "react";

/**
 * Aísla fallos de la capa visual ETA (derivada). No debe tumbar timeline ni paradas.
 */
export class VisualEtaFence extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err, info) {
    if (import.meta.env.DEV) console.warn("[VisualEtaFence]", err, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      if (this.props.fallback) return this.props.fallback;
      const su = this.props.su ?? "#64748b";
      return (
        <span style={{ fontSize: 12, fontWeight: 600, color: su, lineHeight: 1.4 }}>
          ETA no disponible temporalmente
        </span>
      );
    }
    return this.props.children;
  }
}
