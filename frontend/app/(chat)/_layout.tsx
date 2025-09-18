// app/(chat)/_layout.tsx

import { Stack } from "expo-router";
import { useTheme } from "../../context/ThemeContext"; // Note: Adjust path if needed

export default function ChatLayout() {
  const { colors } = useTheme();

  return (
    <Stack>
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