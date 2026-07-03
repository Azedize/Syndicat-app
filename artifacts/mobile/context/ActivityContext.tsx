import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ActivityEntry {
  id: string;
  action: string;
  target: string;
  route?: string;
  icon: string;
  color: string;
  timestamp: string;
  relativeTime?: string;
}

interface ActivityContextType {
  activities: ActivityEntry[];
  logActivity: (entry: Omit<ActivityEntry, "id" | "timestamp">) => void;
  clearActivity: () => void;
}

const ActivityContext = createContext<ActivityContextType | null>(null);
const STORAGE_KEY = "@syndycat_activity";
const MAX_ENTRIES = 50;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  return `Il y a ${days} jours`;
}

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val) {
        const parsed: ActivityEntry[] = JSON.parse(val);
        setActivities(parsed.map((a) => ({ ...a, relativeTime: relativeTime(a.timestamp) })));
      }
    });
  }, []);

  const logActivity = useCallback((entry: Omit<ActivityEntry, "id" | "timestamp">) => {
    const newEntry: ActivityEntry = {
      ...entry,
      id: `act-${Date.now()}`,
      timestamp: new Date().toISOString(),
      relativeTime: "À l'instant",
    };
    setActivities((prev) => {
      const next = [newEntry, ...prev].slice(0, MAX_ENTRIES);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearActivity = useCallback(() => {
    setActivities([]);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <ActivityContext.Provider value={{ activities, logActivity, clearActivity }}>
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used within ActivityProvider");
  return ctx;
}
