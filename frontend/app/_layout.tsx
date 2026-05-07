// app/_layout.tsx

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuth, AuthProvider } from "@/context/AuthContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";
import React from "react";

// ✅ 1. Import your SocketProvider
import { SocketProvider } from "@/context/SocketContext";


function RootNavigator() {
  // ... This function remains the same ...
  const { isAuthenticated, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isAuthenticated) {
    return (
      <Stack initialRouteName="(tabs)" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(chat)" />
      </Stack>
    );
  }

  return (
    <Stack initialRouteName="(auth)" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
    </Stack>
  );
}

function AppShell() {
  const { isDark } = useTheme();

  return (
    <>
      <SocketProvider>
        <RootNavigator />
      </SocketProvider>
      <StatusBar style={isDark ? "light" : "dark"} />
    </>
  );
}


export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}