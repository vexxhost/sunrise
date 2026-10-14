export async function copyTextToClipboard(value: string) {
  let clipboardError: unknown;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch (error) {
    clipboardError = error;
  }

  const previouslyFocused = document.activeElement as HTMLElement | null;
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.inset = "0 auto auto -9999px";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);

  try {
    textArea.focus();
    textArea.select();
    if (!document.execCommand("copy")) {
      throw clipboardError ?? new Error("Clipboard copy was rejected");
    }
  } finally {
    textArea.remove();
    previouslyFocused?.focus({ preventScroll: true });
  }
}
