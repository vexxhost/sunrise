// Textareas preserve LF but normalize CR and CRLF, so escape CR and backslashes.
export function encodeTagForEditor(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\r", "\\r");
}

export function decodeTagFromEditor(value: string) {
  return value.replace(/\\([\\r])/g, (_, escaped: string) =>
    escaped === "r" ? "\r" : "\\",
  );
}
