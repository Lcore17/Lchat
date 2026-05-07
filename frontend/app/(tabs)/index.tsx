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
    Platform,
  } from 'react-native';
  import { router, useFocusEffect } from 'expo-router';
  import { useTheme } from '@/context/ThemeContext';
  import { useAuth } from '@/context/AuthContext';
  import { useSocket } from '@/context/SocketContext';
  import { apiService } from '@/services/apiService';
  import { UserAvatar } from '@/components/UserAvatar';
  import { Feather } from '@expo/vector-icons';
  import { rms, rs } from '@/utils/responsive';

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
    const isWeb = Platform.OS === 'web';
    const [friends, setFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const { colors } = useTheme();
    const { user } = useAuth();
    const { socket } = useSocket();

    const sortByLastMessageTime = useCallback((items: Friend[]) => {
      return [...items].sort((a, b) => {
        const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return timeB - timeA;
      });
    }, []);

    const loadFriends = useCallback(async () => {
      try {
        const response = await apiService.get('/friends/list');
        console.log('API Response for /friends/list:', JSON.stringify(response, null, 2));
        setFriends(sortByLastMessageTime(response.friends || []));
      } catch (error) {
        console.error('Error loading friends:', error);
        Alert.alert('Error', 'Failed to load conversations');
      } finally {
        setLoading(false);
      }
    }, [sortByLastMessageTime]);

    function handleNewMessage(messageData: any) {
      setFriends(prev => {
        const updated = prev.map(friend =>
          friend.conversationId === messageData.conversationId
            ? {
                ...friend,
                lastMessageText: messageData.textOriginal,
                lastMessageAt: messageData.timestamp || messageData.createdAt || new Date().toISOString(),
              }
            : friend
        );

        return sortByLastMessageTime(updated);
      });

      loadFriends();
    }

    function handleUserOnlineStatus(statusData: { userId: string; isOnline: boolean }) {
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
    }

    useEffect(() => {
      loadFriends();
    }, [loadFriends]);

    useFocusEffect(
      useCallback(() => {
        loadFriends();
      }, [loadFriends])
    );

    useEffect(() => {
      if (!socket) return;
      socket.on('message_received', handleNewMessage);
      socket.on('newMessage', handleNewMessage);
      socket.on('user_online', handleUserOnlineStatus);
      // Listen for friendRequestUpdate to refresh chat list
      const handleFriendRequestUpdate = () => {
        loadFriends();
      };
      socket.on('friendRequestUpdate', handleFriendRequestUpdate);
      return () => {
        socket.off('message_received', handleNewMessage);
        socket.off('newMessage', handleNewMessage);
        socket.off('user_online', handleUserOnlineStatus);
        socket.off('friendRequestUpdate', handleFriendRequestUpdate);
      };
    }, [socket, loadFriends]);

    const handleRefresh = async () => {
      setRefreshing(true);
      await loadFriends();
      setRefreshing(false);
    };

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
      pathname: `/(chat)/${conversationId}`,
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
        style={[
          styles.friendItem,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
          isWeb && {
            marginHorizontal: rs(12),
            marginTop: rs(10),
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: rs(12),
          },
        ]}
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
      container: {
        flex: 1,
        backgroundColor: colors.background,
        width: '100%',
        maxWidth: isWeb ? 1600 : undefined,
        alignSelf: isWeb ? 'center' : undefined,
        paddingHorizontal: isWeb ? rs(12) : 0,
        paddingTop: isWeb ? rs(16) : 0,
      },
      header: {
        backgroundColor: colors.surface,
        paddingTop: isWeb ? rs(24) : rs(44),
        paddingHorizontal: rs(18),
        paddingBottom: rs(14),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        borderRadius: isWeb ? rs(14) : 0,
        borderWidth: isWeb ? 1 : 0,
      },
      headerTitle: { fontSize: rms(30), fontWeight: '700', color: colors.text },
      headerSubtitle: { fontSize: rms(16), color: colors.textSecondary, marginTop: rs(4) },
      emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: rs(28) },
      emptyText: { fontSize: rms(18), color: colors.textSecondary, textAlign: 'center', marginTop: rs(14) },
      emptySubText: { fontSize: rms(14), color: colors.textSecondary, textAlign: 'center', marginTop: rs(8) },
      loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
      listContainer: {
        marginTop: isWeb ? rs(12) : 0,
        borderRadius: isWeb ? rs(14) : 0,
        borderWidth: isWeb ? 1 : 0,
        borderColor: colors.border,
        backgroundColor: isWeb ? colors.surface : colors.background,
        overflow: 'hidden',
      },
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
          <View style={dynamicStyles.listContainer}>
            <FlatList
              data={friends}
              keyExtractor={(item) => item.id}
              renderItem={renderFriend}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />}
              contentContainerStyle={{ paddingBottom: isWeb ? rs(12) : 0 }}
            />
          </View>
        )}
      </View>
    );
  };

  export default ChatsScreen;

  const styles = StyleSheet.create({
    friendItem: { flexDirection: 'row', alignItems: 'center', padding: rs(14), borderBottomWidth: 1 },
    avatarContainer: { position: 'relative' },
    onlineIndicator: { position: 'absolute', bottom: 2, right: 2, width: rs(14), height: rs(14), borderRadius: rs(7), borderWidth: 2, borderColor: 'white' },
    friendInfo: { flex: 1, marginLeft: rs(10) },
    friendHeader: { flexDirection: 'row', alignItems: 'center', gap: rs(8) },
    friendName: { fontSize: rms(16), fontWeight: '600' },
    friendUsername: { fontSize: rms(14) },
    lastMessage: { fontSize: rms(14), marginTop: 2 },
    lastSeen: { fontSize: rms(12), marginTop: 2 },
    chatIconContainer: { padding: rs(8) },
  });
