import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/apiService';
import { UserAvatar } from '@/components/UserAvatar';
import { Feather } from '@expo/vector-icons';

interface User {
  id: string;
  username: string;
  nickname: string;
  profilePictureUrl: string | null;
  isOnline: boolean;
  lastSeen: string;
}

interface FriendshipStatus {
  status: 'none' | 'sent' | 'received' | 'accepted' | 'self';
  requestId?: string;
}

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [friendshipStatuses, setFriendshipStatuses] = useState<{ [userId: string]: FriendshipStatus }>({});
  const [loading, setLoading] = useState(false);

  const { colors } = useTheme();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const response = await apiService.get(`/users/search?query=${encodeURIComponent(query)}&limit=20`);
      const users = response.users || [];
      setSearchResults(users);

      const statuses: { [userId: string]: FriendshipStatus } = {};
      for (const user of users) {
        try {
          const statusResponse = await apiService.get(`/friends/status/${user.id}`);
          statuses[user.id] = statusResponse;
        } catch {
          statuses[user.id] = { status: 'none' };
        }
      }
      setFriendshipStatuses(statuses);
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Failed to search users');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(searchQuery.trim());
      }, 300);
    } else {
      setSearchResults([]);
      setFriendshipStatuses({});
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  const sendFriendRequest = async (userId: string) => {
    try {
      await apiService.post('/friends/request', { toUserId: userId });
      setFriendshipStatuses(prev => ({
        ...prev,
        [userId]: { status: 'sent' },
      }));
      Alert.alert('Success', 'Friend request sent!');
    } catch (error) {
      console.error('Send friend request error:', error);
      Alert.alert('Error', 'Failed to send friend request');
    }
  };

  const formatLastSeen = (lastSeen: string, isOnline: boolean) => {
    if (isOnline) return 'Online';
    const now = new Date();
    const lastSeenDate = new Date(lastSeen);
    const diffInMinutes = Math.floor((now.getTime() - lastSeenDate.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const renderActionButton = (user: User) => {
    const status = friendshipStatuses[user.id];
    if (!status || status.status === 'none') {
      return (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={() => sendFriendRequest(user.id)}
        >
          <Feather name="user-plus" size={16} color="white" />
          <Text style={styles.actionButtonText}>Add</Text>
        </TouchableOpacity>
      );
    }

    switch (status.status) {
      case 'sent':
        return (
          <View style={[styles.actionButton, { backgroundColor: colors.textSecondary, opacity: 0.6 }]}>
            <Text style={[styles.actionButtonText, { color: 'white' }]}>Sent</Text>
          </View>
        );
      case 'received':
        return (
          <View style={[styles.actionButton, { backgroundColor: colors.warning }]}>
            <Text style={[styles.actionButtonText, { color: 'white' }]}>Pending</Text>
          </View>
        );
      case 'accepted':
        return (
          <View style={[styles.actionButton, { backgroundColor: colors.success }]}>
            <Feather name="users" size={16} color="white" />
            <Text style={[styles.actionButtonText, { color: 'white' }]}>Friends</Text>
          </View>
        );
      default:
        return null;
    }
  };

  const renderUser = ({ item }: { item: User }) => (
    <View style={[styles.userItem, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.avatarContainer}>
        <UserAvatar uri={item.profilePictureUrl} name={item.nickname || item.username} size={56} />
        {item.isOnline && <View style={[styles.onlineIndicator, { backgroundColor: colors.success }]} />}
      </View>
      <View style={styles.userInfo}>
        <View style={styles.userHeader}>
          <Text style={[styles.userName, { color: colors.text }]}>{item.nickname || item.username}</Text>
          <Text style={[styles.userUsername, { color: colors.textSecondary }]}>@{item.username}</Text>
        </View>
        <Text style={[styles.lastSeen, { color: colors.textSecondary }]}>
          {formatLastSeen(item.lastSeen, item.isOnline)}
        </Text>
      </View>
      {renderActionButton(item)}
    </View>
  );

  const dynamicStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.surface,
      paddingTop: 48,
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 28, fontWeight: 'bold', color: colors.text, marginBottom: 16 },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, height: 44, fontSize: 16, color: colors.text },
    loadingContainer: { padding: 20, alignItems: 'center' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
    emptyText: { fontSize: 18, color: colors.textSecondary, textAlign: 'center', marginTop: 16 },
    emptySubText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
  });

  return (
    <View style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <Text style={dynamicStyles.headerTitle}>Find Friends</Text>
        <View style={dynamicStyles.searchContainer}>
          <Feather name="search" size={20} color={colors.textSecondary} style={dynamicStyles.searchIcon} />
          <TextInput
            style={dynamicStyles.searchInput}
            placeholder="Search by username or nickname..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>
      </View>

      {loading && (
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {searchQuery.length === 0 && (
        <View style={dynamicStyles.emptyContainer}>
          <Feather name="search" size={64} color={colors.textSecondary} />
          <Text style={dynamicStyles.emptyText}>Search for friends</Text>
          <Text style={dynamicStyles.emptySubText}>Enter at least 2 characters to search for users</Text>
        </View>
      )}

      {searchQuery.length >= 2 && searchResults.length === 0 && !loading && (
        <View style={dynamicStyles.emptyContainer}>
          <Feather name="users" size={64} color={colors.textSecondary} />
          <Text style={dynamicStyles.emptyText}>No users found</Text>
          <Text style={dynamicStyles.emptySubText}>Try a different username or nickname</Text>
        </View>
      )}

      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.id}
        renderItem={renderUser}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  userItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  avatarContainer: { position: 'relative' },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'white',
  },
  userInfo: { flex: 1, marginLeft: 12 },
  userHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { fontSize: 16, fontWeight: '600' },
  userUsername: { fontSize: 14 },
  lastSeen: { fontSize: 12, marginTop: 2 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  actionButtonText: { fontSize: 12, fontWeight: '600', color: 'white' },
});
