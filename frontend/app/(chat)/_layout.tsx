// app/(chat)/_layout.tsx

import { Stack } from "expo-router";
import { useTheme } from "../../context/ThemeContext"; // Note: Adjust path if needed
import { Platform } from "react-native";

export default function ChatLayout() {
  const { colors } = useTheme();
  const isWeb = Platform.OS === "web";

  return (
    <Stack
      screenOptions={{
        contentStyle: {
          width: '100%',
          maxWidth: isWeb ? 1100 : undefined,
          alignSelf: isWeb ? 'center' : undefined,
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen
        name="[conversationId]"
        options={{
          // Header options are set dynamically inside the screen component
          // You can set initial options here if you want
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />
    </Stack>
  );
}