import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content for safe rendering in iframes.
 * Strips <script>, event handlers, javascript: URLs, and other dangerous content.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta', 'base'],
    FORBID_ATTR: [
      'onerror', 'onclick', 'onload', 'onmouseover', 'onmouseout', 'onfocus',
      'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress',
      'onmousedown', 'onmouseup', 'onmousemove', 'onpointerdown', 'onpointerup',
      'onpointermove', 'ontouchstart', 'ontouchend', 'ontouchmove',
      'formaction', 'srcdoc',
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],  // allow target="_blank" on links
  });
}
