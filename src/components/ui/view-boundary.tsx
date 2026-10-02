import { Component, lazy, type ComponentType, type ReactNode } from "react";
import { ArrowClockwise, Warning } from "@phosphor-icons/react";
import { btn } from "./styles";

const RELOAD_FLAG = "cotenk-chunk-reload";

/** A failed `import()` of a code-split chunk (stale dev server, update). */
function isChunkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically/i.test(
    msg,
  );
}

/**
 * React.lazy with a retry: a chunk that fails to load is fetched once
 * more, and if that fails too the page reloads once (the usual cause is
 * a dev server that re-optimized its deps, or a new build on disk).
 */
export function lazyView<T extends ComponentType<object>>(
  load: () => Promise<T>,
) {
  return lazy(async () => {
    try {
      const Comp = await load();
      sessionStorage.removeItem(RELOAD_FLAG);
      return { default: Comp };
    } catch (first) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        return { default: await load() };
      } catch (second) {
        if (isChunkError(second) && !sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, "1");
          window.location.reload();
          // Keep suspending until the reload takes over.
          await new Promise(() => {});
        }
        throw second ?? first;
      }
    }
  });
}

type State = { error: Error | null };

/**
 * Keeps a crashing view from blanking the whole app: shows the error
 * with a way back instead of a white window. Remount it (key) to reset.
 */
export class ViewBoundary extends Component<
  { children: ReactNode; onHome: () => void },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[cotenk] view crashed:", error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-dvh min-w-0 flex-1 items-center justify-center bg-canvas px-6">
        <div className="flex max-w-[460px] flex-col items-center text-center">
          <Warning size={26} className="text-danger" />
          <p className="mt-3 text-[14px] font-medium text-ink">
            This view couldn't be shown
          </p>
          <pre className="mt-2 max-h-[160px] w-full overflow-auto whitespace-pre-wrap break-words rounded-[8px] border border-line-soft bg-panel px-3 py-2 text-left font-mono text-[11.5px] text-ink-3">
            {error.message || String(error)}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className={btn.secondary}
              onClick={() => {
                this.props.onHome();
                this.setState({ error: null });
              }}
            >
              Back to pages
            </button>
            <button
              type="button"
              className={btn.primary}
              onClick={() => window.location.reload()}
            >
              <ArrowClockwise size={13} />
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
