export type Attempt<T> = { ok: true; value: T } | { ok: false; message: string };

// Tauri rejects with whatever the command serialized, so normalise once here
// instead of wrapping every call site in try/catch.
export async function attempt<T>(call: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return { ok: false, message };
  }
}
