import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
  ActivityIndicator, // Make sure ActivityIndicator is imported
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/apiService';
import { UserAvatar } from '@/components/UserAvatar';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { rms, rs } from '@/utils/responsive';

// Define the shape of your User object from AuthContext
// This helps TypeScript understand the structure
interface User {
  id: string;
  email: string;
  username: string;
  nickname: string;
  profilePictureUrl: string | null;
  bio: string;
  preferences: {
    theme: "light" | "dark" | "system";
    defaultTranslateLanguage: "en" | "mr" | "te" | "ta" | "hi";
    autoTranslate: boolean;
    notifications: {
      messages: boolean;
      friendRequests: boolean;
      mentions: boolean;
    };
  };
}

export default function ProfileScreen() {
  const { user, logout, updateProfile, setUser } = useAuth(); // Get setUser from context
  const { theme, setTheme, colors } = useTheme();
  const isWeb = Platform.OS === 'web';
  const [uploading, setUploading] = useState(false);

  // Define supported languages, including Hindi, for the UI
  const supportedLanguages = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'mr', name: 'Marathi' },
    { code: 'te', name: 'Telugu' },
    { code: 'ta', name: 'Tamil' },
  ] as const; // Use 'as const' for stricter typing
  
  type LanguageCode = typeof supportedLanguages[number]['code'];

  // This function now performs an optimistic update for a very smooth user experience
  const handleLanguageChange = async (language: LanguageCode) => {
    if (!user) return;

    // 1. Optimistic UI update: change the state in the app immediately
    const originalPreferences = user.preferences;
    const newPreferences = {
      ...originalPreferences,
      defaultTranslateLanguage: language,
    };
    // Use the setUser function from AuthContext to update the global user object
    setUser({ ...user, preferences: newPreferences });

    try {
      // 2. Send the update to the backend server
      await updateProfile({ preferences: newPreferences });
      // The UI has already updated, so no "Success" alert is needed
    } catch (error) {
      // 3. If the server call fails, revert the change in the UI and show an error
      setUser({ ...user, preferences: originalPreferences });
      console.error('Language update error:', error);
      Alert.alert('Error', 'Failed to update language preference.');
    }
  };

  const handleImagePicker = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Permission to access camera roll is required!');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        await uploadProfilePicture(result.assets[0]);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to select image');
    }
  };

  const uploadProfilePicture = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!user) return;
    setUploading(true);
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const fileType = asset.uri.split('.').pop();
      const fileName = `profile-${user.id}-${Date.now()}.${fileType}`;

      // Set a timeout to auto-cancel uploading state after 15 seconds
      timeoutId = setTimeout(() => {
        setUploading(false);
        Alert.alert('Timeout', 'Upload took too long. Please try again.');
      }, 15000);

      const uploadRes = await apiService.uploadFile(`/users/profile/${user.id}/avatar`, {
        uri: asset.uri,
        name: fileName,
        type: `image/${fileType}`,
      });

      // Only update the profilePictureUrl, do not replace the user object
      setUser({ ...user, profilePictureUrl: uploadRes.profilePictureUrl });
      Alert.alert('Success', 'Profile picture updated successfully!');
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Error', 'Failed to update profile picture');
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setUploading(false);
    }
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    if (user) {
        updateProfile({ preferences: { ...user.preferences, theme: newTheme } });
    }
  };

  const handleNotificationToggle = async (type: 'messages' | 'friendRequests' | 'mentions', value: boolean) => {
    if (!user) return;
    const originalPreferences = user.preferences;
    const newPreferences = {
        ...originalPreferences,
        notifications: {
          ...originalPreferences.notifications,
          [type]: value,
        },
    };
    setUser({ ...user, preferences: newPreferences });

    try {
      await updateProfile({ preferences: newPreferences });
    } catch (error) {
      setUser({ ...user, preferences: originalPreferences }); // Revert on error
      console.error('Notification update error:', error);
      Alert.alert('Error', 'Failed to update notification settings');
    }
  };

  const performLogout = async () => {
    try {
      await logout();
      router.replace('/(auth)/login');
    } catch (err) {
      console.error('Logout error:', err);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const shouldLogout = typeof window !== 'undefined' ? window.confirm('Are you sure you want to sign out?') : true;
      if (shouldLogout) {
        void performLogout();
      }
      return;
    }

    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            void performLogout();
          },
        },
      ]
    );
  };
  
  if (!user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: colors.background,
        width: '100%',
        maxWidth: isWeb ? 1600 : undefined,
        alignSelf: isWeb ? 'center' : undefined,
      }}
      contentContainerStyle={{
        paddingTop: isWeb ? rs(16) : 0,
        paddingBottom: isWeb ? rs(24) : 0,
        paddingHorizontal: isWeb ? rs(16) : 0,
      }}
    >
      <View style={[styles.webContentWrap, isWeb && { maxWidth: 1320, alignSelf: 'center' }]}>
      {/* Header Section */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
          isWeb && {
            borderRadius: rs(16),
            borderWidth: 1,
            borderColor: colors.border,
          },
        ]}
      > 
        <View style={styles.avatarContainer}>
          <UserAvatar
            uri={user.profilePictureUrl}
            name={user.nickname || user.username}
            size={100}
          />
          <TouchableOpacity
            style={[styles.cameraButton, { backgroundColor: colors.primary, borderColor: colors.surface }]}
            onPress={handleImagePicker}
            disabled={uploading}
          >
            {uploading ? <ActivityIndicator size="small" color="white" /> : <Feather name="camera" size={16} color="white" />}
          </TouchableOpacity>
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.text }]}>{user.nickname || user.username}</Text>
          <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user.email}</Text>
          <Text style={[styles.userUsername, { color: colors.textSecondary }]}>@{user.username}</Text>
        </View>
      </View>

      {/* Appearance Section */}
      <View
        style={[
          styles.section,
          { backgroundColor: colors.surface },
          isWeb && {
            borderRadius: rs(16),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          },
        ]}
      > 
        <Text style={[styles.sectionTitle, isWeb && styles.sectionTitleWeb, { color: colors.textSecondary }]}>Appearance</Text>
        <View style={[styles.settingItem, isWeb && styles.settingItemWeb, { borderBottomColor: colors.border }]}> 
          <View style={styles.settingIcon}>
            {theme === 'light' ? <Feather name="sun" size={20} color={colors.textSecondary} /> : <Feather name="moon" size={20} color={colors.textSecondary} />}
          </View>
          <View style={styles.settingContent}>
            <Text style={[styles.settingTitle, isWeb && styles.settingTitleWeb, { color: colors.text }]}>Theme</Text>
            <View style={styles.themeOptions}>
              {(['light', 'dark'] as const).map((themeOption) => (
                <TouchableOpacity
                  key={themeOption}
                  style={[
                    styles.themeButton,
                    { borderColor: colors.border },
                    theme === themeOption && [styles.activeThemeButton, { backgroundColor: colors.primary, borderColor: colors.primary }],
                  ]}
                  onPress={() => handleThemeChange(themeOption)}
                >
                  <Text style={[ styles.themeButtonText, isWeb && styles.themeButtonTextWeb, { color: colors.textSecondary }, theme === themeOption && styles.activeThemeButtonText, ]}>
                    {themeOption.charAt(0).toUpperCase() + themeOption.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Translation Section */}
      <View
        style={[
          styles.section,
          { backgroundColor: colors.surface },
          isWeb && {
            borderRadius: rs(16),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          },
        ]}
      > 
        <Text style={[styles.sectionTitle, isWeb && styles.sectionTitleWeb, { color: colors.textSecondary }]}>Translation</Text>
        <View style={[styles.settingItem, isWeb && styles.settingItemWeb, { borderBottomWidth: 0 }]}>
          <Feather name="globe" size={20} color={colors.textSecondary} style={styles.settingIcon} />
          <View style={styles.settingContent}>
            <Text style={[styles.settingTitle, isWeb && styles.settingTitleWeb, { color: colors.text }]}>Default Language</Text>
            <Text style={[styles.settingSubtitle, isWeb && styles.settingSubtitleWeb, { color: colors.textSecondary }]}> 
              Received messages will be translated to this language.
            </Text>
            <View style={styles.languageOptions}>
              {supportedLanguages.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.languageButton,
                    { borderColor: colors.border, backgroundColor: colors.background },
                    user.preferences.defaultTranslateLanguage === lang.code && [styles.activeLanguageButton, { backgroundColor: colors.primary + '20', borderColor: colors.primary }],
                  ]}
                  onPress={() => handleLanguageChange(lang.code)}
                >
                  <Text
                    style={[
                      styles.languageButtonText,
                      isWeb && styles.languageButtonTextWeb,
                      { color: colors.text },
                      user.preferences.defaultTranslateLanguage === lang.code && [styles.activeLanguageButtonText, { color: colors.primary }],
                    ]}
                  >
                    {lang.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Notifications Section */}
      <View
        style={[
          styles.section,
          { backgroundColor: colors.surface },
          isWeb && {
            borderRadius: rs(16),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          },
        ]}
      > 
        <Text style={[styles.sectionTitle, isWeb && styles.sectionTitleWeb, { color: colors.textSecondary }]}>Notifications</Text>
        <View style={[styles.settingItem, isWeb && styles.settingItemWeb, { borderBottomColor: colors.border }]}> 
          <Feather name="bell" size={20} color={colors.textSecondary} style={styles.settingIcon} />
          <View style={styles.settingContent}>
            <Text style={[styles.settingTitle, isWeb && styles.settingTitleWeb, { color: colors.text }]}>Messages</Text>
          </View>
          <Switch value={user.preferences.notifications.messages} onValueChange={(value) => handleNotificationToggle('messages', value)} />
        </View>
        <View style={[styles.settingItem, isWeb && styles.settingItemWeb, { borderBottomWidth: 0 }]}> 
          <Feather name="user" size={20} color={colors.textSecondary} style={styles.settingIcon} />
          <View style={styles.settingContent}>
            <Text style={[styles.settingTitle, isWeb && styles.settingTitleWeb, { color: colors.text }]}>Friend Requests</Text>
          </View>
          <Switch value={user.preferences.notifications.friendRequests} onValueChange={(value) => handleNotificationToggle('friendRequests', value)} />
        </View>
      </View>

      {/* Logout Button */}
      <View style={{ padding: isWeb ? rs(4) : rs(16), paddingTop: isWeb ? rs(20) : rs(16) }}>
        <TouchableOpacity style={[styles.logoutButton, { backgroundColor: colors.error }]} onPress={handleLogout}>
          <Feather name="log-out" size={20} color="white" />
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
      </View>
    </ScrollView>
  );
}

// Full stylesheet
const styles = StyleSheet.create({
  webContentWrap: {
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    paddingTop: rs(44),
    paddingBottom: rs(22),
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: rs(14),
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderRadius: rs(16),
    width: rs(32),
    height: rs(32),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  userInfo: {
    alignItems: 'center',
  },
  userName: {
    fontSize: rms(28),
    fontWeight: 'bold',
    marginBottom: rs(4),
  },
  userEmail: {
    fontSize: rms(18),
    marginBottom: 2,
  },
  userUsername: {
    fontSize: rms(16),
  },
  section: {
    marginTop: rs(12),
  },
  sectionTitle: {
    fontSize: rms(14),
    fontWeight: '600',
    marginHorizontal: rs(16),
    marginBottom: rs(8),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(16),
    paddingVertical: rs(12),
    borderBottomWidth: 1,
  },
  sectionTitleWeb: {
    marginTop: rs(6),
    marginBottom: rs(10),
    fontSize: rms(13),
    letterSpacing: 0.8,
  },
  settingItemWeb: {
    paddingHorizontal: rs(20),
    paddingVertical: rs(14),
  },
  settingIcon: {
    marginRight: rs(16),
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: rms(18),
  },
  settingTitleWeb: {
    fontSize: rms(16),
    lineHeight: rms(22),
    fontWeight: '600',
  },
  settingSubtitle: {
    fontSize: rms(16),
    marginTop: 2,
  },
  settingSubtitleWeb: {
    fontSize: rms(14),
    lineHeight: rms(20),
    marginTop: rs(4),
  },
  themeOptions: {
    flexDirection: 'row',
    gap: rs(8),
    marginTop: rs(12),
  },
  themeButton: {
    paddingHorizontal: rs(12),
    paddingVertical: rs(6),
    borderRadius: rs(16),
    borderWidth: 1,
  },
  activeThemeButton: {},
  themeButtonText: {
    fontSize: rms(12),
    fontWeight: '500',
  },
  themeButtonTextWeb: {
    fontSize: rms(13),
  },
  activeThemeButtonText: {
    color: 'white',
  },
  languageOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rs(8),
    marginTop: rs(12),
  },
  languageButton: {
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    borderRadius: rs(16),
    borderWidth: 1,
  },
  activeLanguageButton: {},
  languageButtonText: {
    fontSize: rms(14),
  },
  languageButtonTextWeb: {
    fontSize: rms(14),
    fontWeight: '500',
  },
  activeLanguageButtonText: {
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: rs(16),
    borderRadius: rs(8),
    gap: rs(8),
  },
  logoutButtonText: {
    color: 'white',
    fontSize: rms(16),
    fontWeight: '600',
  },
});