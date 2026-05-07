import { Tabs } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { Feather } from "@expo/vector-icons";
import { Platform } from "react-native";

export default function TabLayout() {
  const { colors } = useTheme();
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarItemStyle: {
          paddingVertical: isWeb ? 0 : 4,
        },
        sceneStyle: {
          width: '100%',
          backgroundColor: colors.background,
        },
        tabBarStyle: {
          display: 'flex',
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          width: '100%',
          height: isWeb ? 72 : 66,
          paddingBottom: isWeb ? 12 : 8,
          paddingTop: isWeb ? 8 : 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          tabBarIcon: ({ size, color }) => (
            <Feather name="message-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stories"
        options={{
          title: "Stories",
          tabBarIcon: ({ size, color }) => (
            <Feather name="book-open" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ size, color }) => (
            <Feather name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: ({ size, color }) => (
            <Feather name="users" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: "Requests",
          tabBarIcon: ({ size, color }) => (
            <Feather name="user-plus" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ size, color }) => (
            <Feather name="user" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
