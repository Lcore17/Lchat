  // app/(tabs)/index.tsx
  import React, { useState, useEffect, useCallback } from 'react';
  import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    RefreshControl,
  } from 'react-native';
  import { router } from 'expo-router';
  import { useTheme } from '@/context/ThemeContext';
  import { useAuth } from '@/context/AuthContext';
  import { useSocket } from '@/context/SocketContext';
  import { apiService } from '@/services/apiService';
  import { UserAvatar } from '@/components/UserAvatar';
  import { Feather } from '@expo/vector-icons';

  interface Friend {
    id: string;
    username: string;
    nickname: string;
    profilePictureUrl: string | null;
    isOnline: boolean;
    lastSeen: string;
    conversationId: string | null;
    lastMessageText: string;
    lastMessageAt: string | null;
  }

  const ChatsScreen = () => {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const { colors } = useTheme();
    const { user } = useAuth();
    const { socket } = useSocket();

    useEffect(() => {
      loadFriends();
    }, []);

    useEffect(() => {
      if (!socket) return;
      socket.on('message_received', handleNewMessage);
      socket.on('user_online', handleUserOnlineStatus);
      // Listen for friendRequestUpdate to refresh chat list
      const handleFriendRequestUpdate = () => {
        loadFriends();
      };
      socket.on('friendRequestUpdate', handleFriendRequestUpdate);
      return () => {
        socket.off('message_received', handleNewMessage);
        socket.off('user_online', handleUserOnlineStatus);
        socket.off('friendRequestUpdate', handleFriendRequestUpdate);
      };
    }, [socket]);

    const loadFriends = async () => {
      try {
        const response = await apiService.get('/friends/list');
        console.log('API Response for /friends/list:', JSON.stringify(response, null, 2));
        setFriends(response.friends || []);
      } catch (error) {
        console.error('Error loading friends:', error);
        Alert.alert('Error', 'Failed to load conversations');
      } finally {
        setLoading(false);
      }
    };

    const handleRefresh = async () => {
      setRefreshing(true);
      await loadFriends();
      setRefreshing(false);
    };

    const handleNewMessage = useCallback((messageData: any) => {
      setFriends(prev =>
        prev.map(friend =>
          friend.conversationId === messageData.conversationId
            ? {
                ...friend,
                lastMessageText: messageData.textOriginal,
                lastMessageAt: messageData.timestamp,
              }
            : friend
        )
      );
    }, []);

    const handleUserOnlineStatus = useCallback(
      (statusData: { userId: string; isOnline: boolean }) => {
        setFriends(prev =>
          prev.map(friend =>
            friend.id === statusData.userId
              ? {
                  ...friend,
                  isOnline: statusData.isOnline,
                  lastSeen: statusData.isOnline ? new Date().toISOString() : friend.lastSeen,
                }
              : friend
          )
        );
      },
      []
    );

    const handleChatPress = async (friend: Friend) => {
  try {
    let conversationId = friend.conversationId;
    if (!conversationId) {
      const response = await apiService.post('/messages/conversation', {
        friendId: friend.id,
      });
      conversationId = response.data.conversation.id; // Assuming response has data key
    }

    // ✅ Pass both the ID and the friend's name
    router.push({
      pathname: `/${conversationId}`,
      params: { name: friend.nickname || friend.username }
    });

  } catch (error) {
    console.error('Error opening chat:', error);
    Alert.alert('Error', 'Failed to open conversation');
  }
};

    const formatLastSeen = (lastSeen: string) => {
      const now = new Date();
      const lastSeenDate = new Date(lastSeen);
      const diffInMinutes = Math.floor((now.getTime() - lastSeenDate.getTime()) / (1000 * 60));

      if (diffInMinutes < 1) return 'Just now';
      if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
      if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
      return `${Math.floor(diffInMinutes / 1440)}d ago`;
    };

    const formatLastMessage = (messageText: string, messageTime: string | null) => {
      if (!messageText) return 'Start a conversation';
      if (messageTime) {
        const now = new Date();
        const messageDate = new Date(messageTime);
        const diffInMinutes = Math.floor((now.getTime() - messageDate.getTime()) / (1000 * 60));
        let timeText = '';
        if (diffInMinutes < 1) timeText = 'now';
        else if (diffInMinutes < 60) timeText = `${diffInMinutes}m`;
        else if (diffInMinutes < 1440) timeText = `${Math.floor(diffInMinutes / 60)}h`;
        else timeText = `${Math.floor(diffInMinutes / 1440)}d`;
        return `${messageText.substring(0, 30)}${messageText.length > 30 ? '...' : ''} • ${timeText}`;
      }
      return messageText.substring(0, 50) + (messageText.length > 50 ? '...' : '');
    };

    const renderFriend = ({ item }: { item: Friend }) => (
      <TouchableOpacity
        style={[styles.friendItem, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        onPress={() => handleChatPress(item)}
      >
        <View style={styles.avatarContainer}>
          <UserAvatar uri={item.profilePictureUrl} name={item.nickname || item.username} size={56} />
          {item.isOnline && <View style={[styles.onlineIndicator, { backgroundColor: colors.success }]} />}
        </View>

        <View style={styles.friendInfo}>
          <View style={styles.friendHeader}>
            <Text style={[styles.friendName, { color: colors.text }]}>{item.nickname || item.username}</Text>
            <Text style={[styles.friendUsername, { color: colors.textSecondary }]}>@{item.username}</Text>
          </View>
          <Text style={[styles.lastMessage, { color: colors.textSecondary }]}>
            {formatLastMessage(item.lastMessageText, item.lastMessageAt)}
          </Text>
          {!item.isOnline && (
            <Text style={[styles.lastSeen, { color: colors.textSecondary }]}>
              Last seen {formatLastSeen(item.lastSeen)}
            </Text>
          )}
        </View>

        <View style={styles.chatIconContainer}>
          <Feather name="message-circle" size={20} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
    );

    const dynamicStyles = StyleSheet.create({
      container: { flex: 1, backgroundColor: colors.background },
      header: { backgroundColor: colors.surface, paddingTop: 48, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
      headerTitle: { fontSize: 28, fontWeight: 'bold', color: colors.text },
      headerSubtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
      emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
      emptyText: { fontSize: 18, color: colors.textSecondary, textAlign: 'center', marginTop: 16 },
      emptySubText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
      loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    });

    if (loading) {
      return (
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    return (
      <View style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <Text style={dynamicStyles.headerTitle}>Chats</Text>
          <Text style={dynamicStyles.headerSubtitle}>{friends.length} conversations</Text>
        </View>

        {friends.length === 0 ? (
          <View style={dynamicStyles.emptyContainer}>
            <Feather name="users" size={64} color={colors.textSecondary} />
            <Text style={dynamicStyles.emptyText}>No conversations yet</Text>
            <Text style={dynamicStyles.emptySubText}>Add friends to start chatting with them</Text>
          </View>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(item) => item.id}
            renderItem={renderFriend}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />}
          />
        )}
      </View>
    );
  };

  export default ChatsScreen;

  const styles = StyleSheet.create({
    friendItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
    avatarContainer: { position: 'relative' },
    onlineIndicator: { position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'white' },
    friendInfo: { flex: 1, marginLeft: 12 },
    friendHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    friendName: { fontSize: 16, fontWeight: '600' },
    friendUsername: { fontSize: 14 },
    lastMessage: { fontSize: 14, marginTop: 2 },
    lastSeen: { fontSize: 12, marginTop: 2 },
    chatIconContainer: { padding: 8 },
  });
