import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

export interface FavoriteItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: string;
  color: string;
  route: string;
  params?: Record<string, string>;
  addedAt: string;
}

interface FavoritesContextType {
  favorites: FavoriteItem[];
  addFavorite: (item: Omit<FavoriteItem, "addedAt">) => void;
  removeFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (item: Omit<FavoriteItem, "addedAt">) => void;
  clearFavorites: () => void;
}

const FavoritesContext = createContext<FavoritesContextType | null>(null);
const STORAGE_KEY = "@syndycat_favorites";
const MAX_FAVORITES = 20;

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val) setFavorites(JSON.parse(val));
    });
  }, []);

  const save = useCallback((items: FavoriteItem[]) => {
    setFavorites(items);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, []);

  const addFavorite = useCallback(
    (item: Omit<FavoriteItem, "addedAt">) => {
      setFavorites((prev) => {
        if (prev.some((f) => f.id === item.id)) return prev;
        const next = [{ ...item, addedAt: new Date().toISOString() }, ...prev].slice(0, MAX_FAVORITES);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    []
  );

  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.filter((f) => f.id !== id);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const isFavorite = useCallback((id: string) => favorites.some((f) => f.id === id), [favorites]);

  const toggleFavorite = useCallback(
    (item: Omit<FavoriteItem, "addedAt">) => {
      if (favorites.some((f) => f.id === item.id)) {
        removeFavorite(item.id);
      } else {
        addFavorite(item);
      }
    },
    [favorites, addFavorite, removeFavorite]
  );

  const clearFavorites = useCallback(() => save([]), [save]);

  return (
    <FavoritesContext.Provider value={{ favorites, addFavorite, removeFavorite, isFavorite, toggleFavorite, clearFavorites }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
