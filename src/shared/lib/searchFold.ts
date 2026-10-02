// Mirrors `fold_char` in src-tauri/src/session_store/content_search.rs, so the
// in-conversation find agrees with the cross-session search that opened it:
// case-insensitive, with the Turkish `I İ ı i` folded together and the Turkish
// letters (and circumflexed a/i/u) matching their plain forms.
const FOLDS: Record<string, string> = {
  İ: "i",
  I: "i",
  ı: "i",
  î: "i",
  Î: "i",
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
  û: "u",
  Û: "u",
  â: "a",
  Â: "a",
};

export function foldSearchText(text: string): string {
  let out = "";
  for (const char of text) out += FOLDS[char] ?? char.toLowerCase();
  return out;
}
