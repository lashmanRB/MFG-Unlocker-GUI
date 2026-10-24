import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "./api";

// the browser demo has no native picker, so hand back a folder to keep the flow usable
const demoFolder = "D:\\Games\\Stand-in Game";

export async function pickFolder(title: string): Promise<string | null> {
  try {
    const picked = await open({ directory: true, multiple: false, title });
    if (picked === null || picked.length === 0) return null;
    return picked;
  } catch (caught) {
    if (!isTauri) return demoFolder;
    throw caught;
  }
}
