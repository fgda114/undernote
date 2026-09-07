/**
 * Typography helpers — the one script-dependent decision this site makes in
 * code rather than in CSS.
 *
 * Latin labels are set with wide tracking (--label-ls, 0.16em); Hangul never
 * is, because spaced-out Hangul measurably slows reading (design §4.4).
 * CSS cannot ask "is this string Korean", so the class is chosen at render
 * time and the two tracking values stay tokens.
 *
 * This used to live inline in FormatLabel. It moved out when the genre
 * labels became configurable text (config/genres.yaml) rendered by two more
 * components: a bucket label is whatever the editor wrote, so "the labels are
 * Korean" stopped being something a stylesheet could assume.
 */

/**
 * True when the string contains anything outside ASCII — which for this
 * site's label strings means "this is Korean, do not track it out".
 * Deliberately crude: these strings are either a section name or a genre
 * label, never a mix where the distinction would be delicate.
 */
export function hasNonAscii(text: string): boolean {
  return [...text].some((ch) => (ch.codePointAt(0) ?? 0) > 127);
}
