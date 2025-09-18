import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface UserAvatarProps {
  uri: string | null;
  name: string;
  size?: number;
  style?: object;
}

export function UserAvatar({ uri, name, size = 40, style }: UserAvatarProps) {
  const { colors } = useTheme();

  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name[0]?.toUpperCase() || '?';
  };

  const dynamicStyles = StyleSheet.create({
    container: {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    initials: {
      color: 'white',
      fontSize: size * 0.4,
      fontWeight: '600',
    },
  });

  if (uri) {
    // Construct full URL if needed
    const imageUri = uri.startsWith('http') 
      ? uri 
      : `${process.env.EXPO_PUBLIC_API_URL}${uri}`;

    return (
      <View style={[dynamicStyles.container, style]}>
        <Image
          source={{ uri: imageUri }}
          style={dynamicStyles.image}
          onError={() => console.log('Avatar image failed to load:', imageUri)}
        />
      </View>
    );
  }

  return (
    <View style={[dynamicStyles.container, style]}>
      <Text style={dynamicStyles.initials}>{getInitials(name)}</Text>
    </View>
  );
}