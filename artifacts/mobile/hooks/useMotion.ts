import * as Device from "expo-device";
import { Platform } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

// Devices under ~3 GB of RAM (entry-level Android) get the static versions of
// the signature scenes: same information, no continuous animation.
const LOW_MEMORY_BYTES = 3 * 1024 ** 3;
const lowPower =
  Platform.OS === "android" && typeof Device.totalMemory === "number" && Device.totalMemory > 0 && Device.totalMemory < LOW_MEMORY_BYTES;

/**
 * What the current device should animate.
 *   reduced  — the user asked the system to reduce motion: no movement at all
 *              (Reanimated already skips its animations; custom loops check this)
 *   rich     — signature scenes may animate (launch, residence scene)
 */
export function useMotion() {
  const reduced = useReducedMotion();
  return { reduced, rich: !reduced && !lowPower, lowPower };
}
