import { Component, type ErrorInfo, type ReactNode } from "react";
import Button from "../ui/Button";
import ErrorState from "../ui/ErrorState";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render-time errors anywhere below it.
 *
 * Without this a single throw in any component unmounts the whole tree and
 * leaves a blank white page with no explanation and no way back - which is
 * what this application did until now.
 *
 * A class, because getDerivedStateFromError and componentDidCatch have no
 * hook equivalent; this is the one place React still requires one.
 *
 * Recovery is a full reload rather than a state reset or a router navigation.
 * Once a render has thrown, the tree's state is not trustworthy, and the
 * boundary cannot know whether the fault was in the route it was on or in
 * something shared. A reload is the only honest offer.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Left as console.error deliberately: this project has no error-reporting
    // service, and inventing one here would be a dependency and a network
    // egress nobody asked for. This is the hook to wire one into later.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-card border border-line bg-surface shadow-card">
          <ErrorState
            title="Something went wrong"
            description="The page could not be displayed. Reloading usually clears it. If it keeps happening, tell your administrator what you were doing."
          />
          <div className="flex justify-center px-6 pb-6">
            <Button onClick={() => window.location.assign("/")}>
              Reload HR Nexus
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
