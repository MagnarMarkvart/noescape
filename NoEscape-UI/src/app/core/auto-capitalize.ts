import { HttpInterceptorFn } from '@angular/common/http';
import { signal } from '@angular/core';

/** Mirrors Character.autoCapitalize; set by CharacterService (no DI cycle). */
export const AUTO_CAPITALIZE = signal(false);

/** Articles and joining words stay lower-case unless first ("Fire In the Hole"). */
const MINOR = new Set([
  'a', 'an', 'the',
  'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'ja', 'ning', 'ega', 'või', 'et',
]);

export function titleCase(input: string): string {
  let index = 0;
  return input.replace(/\S+/g, (word) => {
    const first = index === 0;
    index += 1;
    const lower = word.toLowerCase();
    if (!first && MINOR.has(lower)) {
      return lower;
    }
    const at = word.search(/\p{L}/u);
    if (at < 0) {
      return word;
    }
    return word.slice(0, at) + word.charAt(at).toLocaleUpperCase() + word.slice(at + 1);
  });
}

const TITLE_KEYS = new Set(['title', 'name', 'label', 'journeyLabel', 'dailyWorkTitle']);
const STRING_LIST_KEYS = new Set(['subtasks']);
/** Free text, identifiers and account fields are never touched. */
const SKIP_PATHS = [/\/character(\/|$)/, /\/skills(\/|$)/, /\/clocks(\/|$)/];

function transform(value: unknown, key: string | null): unknown {
  if (typeof value === 'string') {
    return key && TITLE_KEYS.has(key) ? titleCase(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'string'
        ? key && STRING_LIST_KEYS.has(key)
          ? titleCase(item)
          : item
        : transform(item, null),
    );
  }
  if (value && typeof value === 'object' && !(value instanceof FormData) && !(value instanceof Blob)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = transform(v, k);
    }
    return out;
  }
  return value;
}

export function capitalizePayload<T>(body: T): T {
  return transform(body, null) as T;
}

export const autoCapitalizeInterceptor: HttpInterceptorFn = (req, next) => {
  if (
    !AUTO_CAPITALIZE() ||
    !['POST', 'PUT', 'PATCH'].includes(req.method) ||
    req.body == null ||
    typeof req.body !== 'object' ||
    SKIP_PATHS.some((re) => re.test(req.url))
  ) {
    return next(req);
  }
  return next(req.clone({ body: capitalizePayload(req.body) }));
};
