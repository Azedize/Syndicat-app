import AsyncStorage from "@react-native-async-storage/async-storage";

import { publicEntry, type FirstLaunchStage } from "./permissionFlow";

const STORAGE_KEY = "@mizan_first_launch";

let cached: FirstLaunchStage | null = null;

export async function readFirstLaunchStage(): Promise<FirstLaunchStage> {
  if (cached) return cached;
  let saved: string | null = null;
  try {
    saved = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // Unreadable storage: the presentation is shown again, nothing is lost.
  }
  cached = saved === "language" || saved === "done" ? saved : "new";
  return cached;
}

export async function setFirstLaunchStage(stage: FirstLaunchStage): Promise<void> {
  cached = stage;
  await AsyncStorage.setItem(STORAGE_KEY, stage).catch(() => {});
}

export async function publicHome(): Promise<ReturnType<typeof publicEntry>> {
  return publicEntry(await readFirstLaunchStage());
}
