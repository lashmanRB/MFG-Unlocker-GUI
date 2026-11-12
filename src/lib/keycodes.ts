const modifierCodes = [16, 17, 18, 91, 92];

// Windows virtual key code from a keydown, the value the mod reads back from
// the INI with GetPrivateProfileIntW
export function captureVk(event: KeyboardEvent): number | null {
  const code = event.keyCode;
  if (!Number.isInteger(code)) return null;
  if (code < 8 || code === 27 || code >= 255) return null;
  if (modifierCodes.includes(code)) return null;
  return code;
}

export function isVkCode(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

// A keybind as the mod's [Keybinds] section keeps it: optional Ctrl/Shift/Alt
// prefixes and a virtual-key code in uppercase hex, like Ctrl+Shift+0x21.
export function captureCombo(event: KeyboardEvent): string | null {
  const code = captureVk(event);
  if (code === null) return null;
  if (event.metaKey) return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");
  parts.push(`0x${code.toString(16).toUpperCase().padStart(2, "0")}`);
  return parts.join("+");
}

export function comboLabel(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  const parts = trimmed.split("+");
  const key = parts[parts.length - 1];
  const code = key.startsWith("0x") || key.startsWith("0X")
    ? Number.parseInt(key.slice(2), 16)
    : Number.parseInt(key, 10);
  const names = parts.slice(0, -1).map((part) => {
    const lower = part.toLowerCase();
    if (lower === "ctrl" || lower === "control") return "Ctrl";
    if (lower === "shift") return "Shift";
    if (lower === "alt") return "Alt";
    return part;
  });
  if (!Number.isInteger(code)) return trimmed;
  names.push(vkLabel(String(code)));
  return names.join(" + ");
}

export function vkLabel(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  if (!isVkCode(trimmed)) return trimmed;
  return labelForCode(Number.parseInt(trimmed, 10));
}

function labelForCode(code: number): string {
  switch (code) {
    case 8:
      return "Backspace";
    case 9:
      return "Tab";
    case 13:
      return "Enter";
    case 16:
      return "Shift";
    case 17:
      return "Ctrl";
    case 18:
      return "Alt";
    case 19:
      return "Pause";
    case 20:
      return "Caps Lock";
    case 27:
      return "Escape";
    case 32:
      return "Space";
    case 33:
      return "Page Up";
    case 34:
      return "Page Down";
    case 35:
      return "End";
    case 36:
      return "Home";
    case 37:
      return "Left";
    case 38:
      return "Up";
    case 39:
      return "Right";
    case 40:
      return "Down";
    case 45:
      return "Insert";
    case 46:
      return "Delete";
    case 91:
      return "Left Win";
    case 92:
      return "Right Win";
    case 106:
      return "Numpad *";
    case 107:
      return "Numpad +";
    case 108:
      return "Numpad ,";
    case 109:
      return "Numpad -";
    case 110:
      return "Numpad .";
    case 111:
      return "Numpad /";
    case 186:
      return ";";
    case 187:
      return "=";
    case 188:
      return ",";
    case 189:
      return "-";
    case 190:
      return ".";
    case 191:
      return "/";
    case 192:
      return "`";
    case 219:
      return "[";
    case 220:
      return "\\";
    case 221:
      return "]";
    case 222:
      return "'";
    default:
      break;
  }
  if (code >= 48 && code <= 57) return String.fromCharCode(code);
  if (code >= 65 && code <= 90) return String.fromCharCode(code);
  if (code >= 96 && code <= 105) return `Numpad ${code - 96}`;
  if (code >= 112 && code <= 135) return `F${code - 111}`;
  return `VK ${code}`;
}
