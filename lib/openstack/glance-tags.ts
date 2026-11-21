export const GLANCE_MAX_TAG_LENGTH = 255;

const PYTHON_STRIP_EDGE =
  /^(?:[\u001c-\u001f]|\p{White_Space})|(?:[\u001c-\u001f]|\p{White_Space})$/u;
const DISPLAY_UNSAFE = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;
const JSON_UNESCAPED_INVISIBLE = /[\u007f-\u009f\ufeff]/gu;

export function glanceTagLength(value: string) {
  return Array.from(value).length;
}

export function glanceRequestTrimsTag(value: string) {
  return PYTHON_STRIP_EDGE.test(value);
}

export function formatGlanceTag(value: string) {
  if (
    value.length > 0 &&
    !glanceRequestTrimsTag(value) &&
    !DISPLAY_UNSAFE.test(value)
  ) {
    return value;
  }

  return JSON.stringify(value).replace(JSON_UNESCAPED_INVISIBLE, (character) =>
    `\\u${character.codePointAt(0)!.toString(16).padStart(4, "0")}`,
  );
}
