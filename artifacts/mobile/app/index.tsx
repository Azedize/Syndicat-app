import { Redirect, type Href } from "expo-router";
import { useEffect, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import { publicHome } from "@/lib/firstLaunch";

export default function RootIndexScreen() {
  const { user, isLoading } = useAuth();
  const [home, setHome] = useState<Href | null>(null);

  useEffect(() => {
    publicHome().then(setHome);
  }, []);

  // Keep the root entry route-only. Mounting the welcome screen here as a
  // second component caused Expo web to render a partially initialized copy
  // of the public page before the real /welcome route settled.
  if (isLoading || !home) return null;
  return <Redirect href={user ? "/(tabs)" : home} />;
}