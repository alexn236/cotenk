import { create } from "zustand";

export type Toast = {
  id: number;
  message: string;
  /** Optional inline action, e.g. "Undo". */
  action?: { label: string; run: () => void };
  tone?: "default" | "error";
};

type ToastState = {
  toasts: Toast[];
  show: (t: Omit<Toast, "id">, ttlMs?: number) => void;
  dismiss: (id: number) => void;
};

let seq = 0;

/** Tiny app-wide toast queue — at most three visible, newest last. */
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  show: (t, ttlMs = 5000) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    setTimeout(() => get().dismiss(id), ttlMs);
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (
  message: string,
  opts?: Omit<Toast, "id" | "message">,
) => useToasts.getState().show({ message, ...opts });
