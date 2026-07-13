// Module-level emitter so non-component code (e.g. the sync drain) can raise a toast.
type ToastListener = (message: string) => void;

const listeners = new Set<ToastListener>();

export function showToast(message: string): void {
  for (const listener of listeners) listener(message);
}

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
