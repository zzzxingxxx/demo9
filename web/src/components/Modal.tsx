import { useEffect, useRef, type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  label,
  initialFocus,
  className = "",
  children
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  initialFocus?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      if (initialFocus) dialog.querySelector<HTMLElement>(initialFocus)?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, initialFocus]);

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom
        ) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
