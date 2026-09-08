import { useRef, useState } from "react";

export function useToolAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(false);
  async function run(action: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "操作失败");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return {
    run,
    busy,
    error: message ? (
      <p className="form-error" role="alert">
        {message}
      </p>
    ) : null
  };
}
