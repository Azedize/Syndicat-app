import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import BadgeCard from "@/components/BadgeCard";
import { useAuth } from "@/context/AuthContext";

// Temporary dev-only screen used to visually QA the BadgeCard component.
// Not linked from any navigation — safe to delete after review.
export default function DevBadgePreview() {
  const { login, user } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("sara.bouzid@gmail.com", "password123").then(() => setReady(true));
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, gap: 20, backgroundColor: "#f8f7ff" }}>
      <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold" }}>Dev preview — {user?.role ?? "loading..."}</Text>
      {ready ? <BadgeCard /> : <View />}
    </ScrollView>
  );
}
