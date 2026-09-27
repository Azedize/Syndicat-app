import { useEffect, useState } from "react";
import { getFileTicket } from "@/services/api";

// Tickets live 5 minutes; refresh well before expiry so rendered <Image> URLs
// stay valid while the screen is open.
const REFRESH_INTERVAL_MS = 3 * 60 * 1000;

/**
 * Download ticket for building protected image URLs during render
 * (see withFileTicket). Returns null until the first ticket is fetched, or
 * while signed out.
 */
export function useFileTicket(enabled = true): string | null {
  const [ticket, setTicket] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setTicket(null);
      return;
    }
    let active = true;
    const load = () =>
      getFileTicket().then((value) => {
        if (active) setTicket(value);
      });
    load();
    const timer = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [enabled]);

  return ticket;
}
