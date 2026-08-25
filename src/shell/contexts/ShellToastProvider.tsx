import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { ShellProgressBubble } from "../ui/ShellProgressBubble";
import {
  useShellToast,
  type ShellToastAction,
  type ShowToastOptions,
} from "../hooks/useShellToast";

type ShellToastApi = {
  showToast: (text: string, options?: ShowToastOptions) => void;
  dismissToast: () => void;
};

const ShellToastContext = createContext<ShellToastApi | null>(null);

export function ShellToastProvider({ children }: { children: ReactNode }) {
  const {
    showToast,
    dismissToast,
    toastMessage,
    toastAction,
    toastLeaving,
    toastVisible,
  } = useShellToast();

  return (
    <ShellToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {toastVisible && toastMessage && (
        <div className="shell-toast-host" aria-live="polite">
          <ShellProgressBubble
            message={toastMessage}
            leaving={toastLeaving}
            showSpinner={false}
            action={toastAction ?? undefined}
          />
        </div>
      )}
    </ShellToastContext.Provider>
  );
}

export function useAppToast(): ShellToastApi {
  const ctx = useContext(ShellToastContext);
  if (!ctx) {
    throw new Error("useAppToast must be used within ShellToastProvider");
  }
  return ctx;
}

export type { ShellToastAction, ShowToastOptions };
