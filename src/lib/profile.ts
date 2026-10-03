import { create } from "zustand";

/**
 * The name of the person using this device — the greeting on Home and
 * the @name that counts as "me" for task reminders. Stored locally.
 */

const KEY = "cotenk-profile-name";

function read(): string {
  try {
    return localStorage.getItem(KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

type ProfileState = {
  name: string;
  setName: (name: string) => void;
};

export const useProfile = create<ProfileState>((set) => ({
  name: typeof window !== "undefined" ? read() : "",
  setName: (raw) => {
    const name = raw.trim().slice(0, 60);
    try {
      if (name) localStorage.setItem(KEY, name);
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
    set({ name });
  },
}));
