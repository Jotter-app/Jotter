// CSS properties (kebab-case, for style.setProperty/computed.getPropertyValue)
// that affect text layout -- mirrored from the textarea onto a hidden div so
// the div wraps text identically to the real one.
const MIRRORED_PROPERTIES = [
  "box-sizing",
  "width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-style",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "word-spacing",
  "line-height",
  "text-indent",
  "text-align",
  "text-transform",
  "white-space",
  "word-wrap",
  "tab-size",
];

export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

/**
 * Approximates the pixel position of the caret at `position` within a plain
 * <textarea>, relative to the textarea's own top-left (border box) and
 * *before* accounting for scroll. There's no native browser API for this
 * (unlike contenteditable, where Range.getBoundingClientRect() just works)
 * -- standard workaround: mirror the textarea's box-relevant CSS onto a
 * hidden div, fill it with the text up to the caret, and measure a marker
 * span appended right after. Callers positioning an absolutely-positioned
 * sibling within the textarea's own offset parent should subtract
 * textarea.scrollTop/scrollLeft themselves.
 */
export function getCaretCoordinates(textarea: HTMLTextAreaElement, position: number): CaretCoordinates {
  const div = document.createElement("div");
  document.body.appendChild(div);

  const computed = window.getComputedStyle(textarea);
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.top = "0";
  div.style.left = "-9999px";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";

  for (const prop of MIRRORED_PROPERTIES) {
    div.style.setProperty(prop, computed.getPropertyValue(prop));
  }

  div.textContent = textarea.value.substring(0, position);

  const span = document.createElement("span");
  // A truly empty span collapses to zero size in some browsers when
  // measuring offsets -- any marker character keeps it measurable, and
  // which one doesn't matter since the div is hidden anyway.
  span.textContent = ".";
  div.appendChild(span);

  const coordinates: CaretCoordinates = {
    top: span.offsetTop,
    left: span.offsetLeft,
    height: parseInt(computed.lineHeight, 10) || span.offsetHeight,
  };

  document.body.removeChild(div);
  return coordinates;
}
