import { Component, type ErrorInfo, type ReactNode } from "react";
import { shellLog } from "../../shell";
import { ShellErrorPage } from "./ShellErrorPage";

type Props = { children: ReactNode };

type State = {
  error: Error | null;
  componentStack: string | null;
};

/** 捕获壳 React 树 render 错误，避免白屏 */
export class ShellErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    shellLog.error("shell", "error boundary", error, {
      stack: info.componentStack ?? "",
    });
  }

  render() {
    if (this.state.error) {
      return (
        <ShellErrorPage
          error={this.state.error}
          componentStack={this.state.componentStack}
        />
      );
    }
    return this.props.children;
  }
}
