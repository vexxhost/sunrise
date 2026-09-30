export type BarbicanPayloadPresentation = {
  content: string;
  encoding: "text" | "base64";
  size: number;
};

function isTextContentType(contentType: string) {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType?.startsWith("text/") ||
    mediaType === "application/json" ||
    mediaType === "application/xml" ||
    mediaType === "application/x-pem-file" ||
    mediaType === "application/pem-certificate-chain"
  );
}

function decodePrintableUtf8(bytes: Uint8Array) {
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    for (const character of value) {
      const code = character.codePointAt(0) ?? 0;
      if (
        (code < 32 &&
          character !== "\n" &&
          character !== "\r" &&
          character !== "\t") ||
        code === 127
      ) {
        return null;
      }
    }
    return value;
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

export function presentBarbicanPayload(
  bytes: Uint8Array,
  contentType: string,
): BarbicanPayloadPresentation {
  const decoded = decodePrintableUtf8(bytes);
  if (
    decoded !== null &&
    (isTextContentType(contentType) || decoded.length > 0)
  ) {
    return { content: decoded, encoding: "text", size: bytes.byteLength };
  }
  return {
    content: encodeBase64(bytes),
    encoding: "base64",
    size: bytes.byteLength,
  };
}
