import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { CloudArrowUp, Devices, Storefront, X } from "@phosphor-icons/react";
import { useAuth, type DialogMode } from "@/lib/auth-store";
import { Modal } from "@/components/ui/modal";

const FIELD =
  "mt-1.5 h-9 w-full rounded-[8px] border border-line bg-panel-2 px-3 text-[13px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-3 focus:border-accent-line";
const LABEL = "mt-3.5 block text-[11.5px] font-medium text-ink-3 first:mt-0";
const SUBMIT =
  "mt-4 h-9 w-full rounded-[8px] bg-accent text-[13px] font-medium text-on-accent transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";
const LINK =
  "text-accent-2 transition-colors duration-150 hover:text-accent";

const TITLES: Record<DialogMode, string> = {
  signin: "Sign in",
  signup: "Create account",
  reset: "Reset password",
  recovery: "Set a new password",
};

/** Shared submit wrapper: busy flag plus inline error / note. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, note, setError, setNote, run };
}

function Messages({ error, note }: { error: string | null; note: string | null }) {
  return (
    <>
      {error && (
        <p className="mt-3 text-[12px] leading-snug text-danger">{error}</p>
      )}
      {note && (
        <p className="mt-3 text-[12px] leading-snug text-accent-2">{note}</p>
      )}
    </>
  );
}

function Switch({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-center text-[12px] text-ink-3">{children}</p>;
}

/**
 * Email + password forms of the sign-in dialog: sign in, create an
 * account (with the name other people see), reset a forgotten password
 * and set a new one. Errors and notes render inline; a successful
 * sign-in is picked up by the auth store, which closes the dialog.
 */
export function AuthForm() {
  const mode = useAuth((s) => s.dialogMode);
  const setMode = useAuth((s) => s.setDialogMode);
  // Keyed by mode: every screen starts with fresh messages.
  return mode === "reset" ? (
    <ResetForm key="reset" onBack={() => setMode("signin")} />
  ) : mode === "recovery" ? (
    <NewPasswordForm key="recovery" />
  ) : (
    <CredentialsForm key={mode} mode={mode} setMode={setMode} />
  );
}

function CredentialsForm({
  mode,
  setMode,
}: {
  mode: "signin" | "signup";
  setMode: (m: DialogMode) => void;
}) {
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, note, setError, setNote, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result =
        mode === "signin"
          ? await signIn(email.trim(), password)
          : await signUp(email.trim(), password, name);
      if (result === null) return;
      if (mode === "signup" && result.startsWith("Account created")) {
        setNote(result);
      } else {
        setError(result);
      }
    });
  };

  return (
    <form onSubmit={submit}>
      {mode === "signup" && (
        <>
          <label className={LABEL}>Your name</label>
          <input
            required
            autoFocus
            maxLength={60}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="How others see you"
            className={FIELD}
          />
        </>
      )}
      <label className={LABEL}>Email</label>
      <input
        type="email"
        required
        autoFocus={mode === "signin"}
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.currentTarget.value)}
        placeholder="you@example.com"
        className={FIELD}
      />

      <div className="mt-3.5 flex items-baseline justify-between">
        <label className="block text-[11.5px] font-medium text-ink-3">
          Password
        </label>
        {mode === "signin" && (
          <button
            type="button"
            onClick={() => setMode("reset")}
            className={`text-[11.5px] ${LINK}`}
          >
            Forgot password?
          </button>
        )}
      </div>
      <input
        type="password"
        required
        minLength={mode === "signup" ? 8 : undefined}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        value={password}
        onChange={(e) => setPassword(e.currentTarget.value)}
        placeholder={mode === "signup" ? "8+ characters" : ""}
        className={FIELD}
      />

      <Messages error={error} note={note} />

      <button type="submit" disabled={busy} className={SUBMIT}>
        {busy
          ? mode === "signin"
            ? "Signing in…"
            : "Creating account…"
          : mode === "signin"
            ? "Sign in"
            : "Create account"}
      </button>

      <Switch>
        {mode === "signin" ? "New here? " : "Have an account? "}
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className={LINK}
        >
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </Switch>
    </form>
  );
}

/**
 * Forgotten password: sends the reset email, then takes the code from
 * it. The link in the same email works too where the web app runs.
 */
function ResetForm({ onBack }: { onBack: () => void }) {
  const requestReset = useAuth((s) => s.requestPasswordReset);
  const verifyCode = useAuth((s) => s.verifyResetCode);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const { busy, error, note, setError, setNote, run } = useSubmit();

  const send = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const err = await requestReset(email.trim());
      if (err) {
        setError(err);
        return;
      }
      setSent(true);
      setNote(
        "If an account exists for this address, an email is on its way. Enter the code from it below, or open its link.",
      );
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const err = await verifyCode(email.trim(), code);
      if (err) setError(err);
    });
  };

  return (
    <form onSubmit={sent ? verify : send}>
      <label className={LABEL}>Email</label>
      <input
        type="email"
        required
        autoFocus={!sent}
        disabled={sent}
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.currentTarget.value)}
        placeholder="you@example.com"
        className={`${FIELD} disabled:opacity-60`}
      />
      {sent && (
        <>
          <label className={LABEL}>Code from the email</label>
          <input
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
            placeholder="123456"
            className={`${FIELD} font-mono tracking-[0.2em]`}
          />
        </>
      )}

      <Messages error={error} note={note} />

      <button type="submit" disabled={busy} className={SUBMIT}>
        {busy
          ? sent
            ? "Checking…"
            : "Sending…"
          : sent
            ? "Continue"
            : "Send reset email"}
      </button>

      <Switch>
        {sent ? (
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
              setNote(null);
              setError(null);
            }}
            className={LINK}
          >
            Use another address
          </button>
        ) : (
          <button type="button" onClick={onBack} className={LINK}>
            Back to sign in
          </button>
        )}
      </Switch>
    </form>
  );
}

/** New password for the signed-in user (after a reset, or to change it). */
function NewPasswordForm() {
  const updatePassword = useAuth((s) => s.updatePassword);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const { busy, error, note, setError, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setError("The passwords don't match.");
      return;
    }
    void run(async () => {
      const err = await updatePassword(password);
      if (err) setError(err);
    });
  };

  return (
    <form onSubmit={submit}>
      <label className={LABEL}>New password</label>
      <input
        type="password"
        required
        autoFocus
        minLength={8}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.currentTarget.value)}
        placeholder="8+ characters"
        className={FIELD}
      />
      <label className={LABEL}>Repeat it</label>
      <input
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => setRepeat(e.currentTarget.value)}
        className={FIELD}
      />
      <Messages error={error} note={note} />
      <button type="submit" disabled={busy} className={SUBMIT}>
        {busy ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

const PERKS = [
  {
    icon: Devices,
    text: "Open your pages on every device — they sync through Supabase.",
  },
  {
    icon: CloudArrowUp,
    text: "Pages you made on this device can come along — you choose which.",
  },
  {
    icon: Storefront,
    text: "Publish pages to the marketplace under your name.",
  },
];

/**
 * Sign-in dialog. Opens from anywhere via `requestSignIn(reason)` — the
 * workspace itself works without an account, so this only appears when
 * the user asks for something that needs one (sync, publish, community).
 */
export function SignInDialog() {
  const open = useAuth((s) => s.dialogOpen);
  const reason = useAuth((s) => s.dialogReason);
  const mode = useAuth((s) => s.dialogMode);
  const close = useAuth((s) => s.closeDialog);

  return (
    <Modal open={open} onClose={close} width={720}>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px]">
        <div className="hidden flex-col justify-between border-r border-line-soft bg-panel-2/60 p-6 md:flex">
          <div>
            <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-accent-dim">
              <span className="text-[15px] font-semibold leading-none text-accent">
                C
              </span>
            </div>
            <h2 className="mt-5 text-[19px] font-semibold tracking-[-0.01em] text-ink">
              Keep this workspace
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
              {reason ??
                "Your pages live on this device right now. An account keeps them everywhere."}
            </p>
          </div>
          <ul className="mt-8 flex flex-col gap-3">
            {PERKS.map(({ icon: PIcon, text }) => (
              <li key={text} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border border-line-soft bg-panel text-accent">
                  <PIcon size={12} />
                </span>
                <span className="text-[12px] leading-relaxed text-ink-2">
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative p-6">
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-[6px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
          >
            <X size={14} />
          </button>
          <h3 className="text-[14px] font-semibold text-ink">{TITLES[mode]}</h3>
          {reason && (
            <p className="mt-1 text-[12px] leading-snug text-ink-3 md:hidden">
              {reason}
            </p>
          )}
          <div className="mt-4">
            <AuthForm />
          </div>
          <p className="mt-4 text-center text-[11.5px] text-ink-3">
            Agents run locally and never need an account.
          </p>
        </div>
      </div>
    </Modal>
  );
}
