import { router } from "expo-router";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "@/context/AuthContext";
import WelcomeScreen from "@/app/welcome";

export default function RootIndexScreen() {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      router.replace("/(tabs)/" as any);
    }
  }, [user]);

  return <WelcomeScreen />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#070D1A" },
});