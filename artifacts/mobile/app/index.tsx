import { Redirect } from "expo-router";

import { useAuth } from "@/context/AuthContext";

export default function RootIndexScreen() {
  const { user, isLoading } = useAuth();

  // Keep the root entry route-only. Mounting the welcome screen here as a
  // second component caused Expo web to render a partially initialized copy
  // of the public page before the real /welcome route settled.
  if (isLoading) return null;
  return <Redirect href={user ? "/(tabs)" : "/welcome"} />;
}