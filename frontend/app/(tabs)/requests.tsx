import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/apiService';
import { UserAvatar } from '@/components/UserAvatar';
import { Feather } from '@expo/vector-icons';

interface FriendRequest {
  id: string;
  from?: {
    id: string;
    username: string;
    nickname: string;
    profilePictureUrl: string | null;
    isOnline: boolean;
    lastSeen: string;
  };
  to?: {
    id: string;
    username: string;
    nickname: string;
    profilePictureUrl: string | null;
    isOnline: boolean;
    lastSeen: string;
  };
  message: string;
  status?: string;
  createdAt: string;
}

export default function RequestsScreen() {
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);

  const { colors } = useTheme();

  const loadRequests = useCallback(async () => {
    try {
      const [receivedResponse, sentResponse] = await Promise.all([
        apiService.get('/friends/requests'),
        apiService.get('/friends/requests/sent'),
      ]);

      setReceivedRequests(receivedResponse.requests || []);
      setSentRequests(sentResponse.requests || []);
    } catch (error) {
      console.error('Error loading requests:', error);
      Alert.alert('Error', 'Failed to load friend requests');
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for socket event to auto-refresh requests
  const { socket } = require('@/context/SocketContext').useSocket();
  useEffect(() => {
    loadRequests();
    if (socket) {
      const handler = () => {
        loadRequests();
      };
      socket.on('friendRequestUpdate', handler);
      return () => {
        socket.off('friendRequestUpdate', handler);
      };
    }
  }, [loadRequests, socket]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  }, [loadRequests]);

  const handleAcceptRequest = async (requestId: string) => {
    setProcessingRequest(requestId);
    try {
      await apiService.post('/friends/accept', { requestId });
      setReceivedRequests(prev => prev.filter(req => req.id !== requestId));
      Alert.alert('Success', 'Friend request accepted!');
    } catch (error) {
      console.error('Error accepting request:', error);
      Alert.alert('Error', 'Failed to accept friend request');
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleRejectRequest = (requestId: string) => {
    Alert.alert('Reject Request', 'Are you sure you want to reject this friend request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setProcessingRequest(requestId);
          try {
            await apiService.post('/friends/reject', { requestId });
            setReceivedRequests(prev => prev.filter(req => req.id !== requestId));
            Alert.alert('Success', 'Friend request rejected');
          } catch (error) {
            console.error('Error rejecting request:', error);
            Alert.alert('Error', 'Failed to reject friend request');
          } finally {
            setProcessingRequest(null);
          }
        },
      },
    ]);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d ago`;

    return date.toLocaleDateString();
  };

  // ✅ Memoized styles (prevents re-creating styles on every render)
  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          backgroundColor: colors.surface,
          paddingTop: 48,
          paddingHorizontal: 20,
          paddingBottom: 0,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerTitle: {
          fontSize: 28,
          fontWeight: 'bold',
          color: colors.text,
          marginBottom: 16,
        },
        tabContainer: { flexDirection: 'row' },
        tab: {
          flex: 1,
          paddingVertical: 12,
          alignItems: 'center',
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        activeTab: { borderBottomColor: colors.primary },
        tabText: { fontSize: 16, fontWeight: '500', color: colors.textSecondary },
        activeTabText: { color: colors.primary },
        tabBadge: {
          position: 'absolute',
          top: 6,
          right: 20,
          backgroundColor: colors.primary,
          borderRadius: 10,
          minWidth: 20,
          height: 20,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBadgeText: { color: 'white', fontSize: 12, fontWeight: '600' },
        emptyContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 32,
        },
        emptyText: {
          fontSize: 18,
          color: colors.textSecondary,
          textAlign: 'center',
          marginTop: 16,
        },
        emptySubText: {
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: 'center',
          marginTop: 8,
        },
        loadingContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        },
      }),
    [colors],
  );

  if (loading) {
    return (
      <View style={dynamicStyles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const currentData = activeTab === 'received' ? receivedRequests : sentRequests;
  const renderItem = activeTab === 'received' ? renderReceivedRequest : renderSentRequest;

  return (
    <View style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <Text style={dynamicStyles.headerTitle}>Friend Requests</Text>
        <View style={dynamicStyles.tabContainer}>
          {/* Tabs... same as your code */}
        </View>
      </View>

      {currentData.length === 0 ? (
        <View style={dynamicStyles.emptyContainer}>
          <Feather name="user-plus" size={64} color={colors.textSecondary} />
          <Text style={dynamicStyles.emptyText}>
            {activeTab === 'received' ? 'No pending requests' : 'No sent requests'}
          </Text>
          <Text style={dynamicStyles.emptySubText}>
            {activeTab === 'received'
              ? 'Friend requests will appear here'
              : 'Send friend requests to connect with others'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={currentData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
          }
        />
      )}
    </View>
  );

  // === Render functions moved below (unchanged logic) ===
  function renderReceivedRequest({ item }: { item: FriendRequest }) {
    return (
      <View style={[styles.requestItem, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <UserAvatar uri={item.from?.profilePictureUrl || null} name={item.from?.nickname || item.from?.username || ''} size={56} />
        <View style={styles.requestInfo}>
          <View style={styles.requestHeader}>
            <Text style={[styles.requesterName, { color: colors.text }]}>{item.from?.nickname || item.from?.username}</Text>
            <Text style={[styles.requestTime, { color: colors.textSecondary }]}>{formatDate(item.createdAt)}</Text>
          </View>
          <Text style={[styles.requesterUsername, { color: colors.textSecondary }]}>@{item.from?.username}</Text>
          {item.message && <Text style={[styles.requestMessage, { color: colors.textSecondary }]}>"{item.message}"</Text>}
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.acceptButton, { backgroundColor: colors.success }]}
            onPress={() => handleAcceptRequest(item.id)}
            disabled={processingRequest === item.id}
          >
            {processingRequest === item.id ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Feather name="check" size={16} color="white" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rejectButton, { backgroundColor: colors.error }]}
            onPress={() => handleRejectRequest(item.id)}
            disabled={processingRequest === item.id}
          >
            <Feather name="x" size={16} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderSentRequest({ item }: { item: FriendRequest }) {
    return (
      <View style={[styles.requestItem, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <UserAvatar uri={item.to?.profilePictureUrl || null} name={item.to?.nickname || item.to?.username || ''} size={56} />
        <View style={styles.requestInfo}>
          <View style={styles.requestHeader}>
            <Text style={[styles.requesterName, { color: colors.text }]}>{item.to?.nickname || item.to?.username}</Text>
            <Text style={[styles.requestTime, { color: colors.textSecondary }]}>{formatDate(item.createdAt)}</Text>
          </View>
          <Text style={[styles.requesterUsername, { color: colors.textSecondary }]}>@{item.to?.username}</Text>
          {item.message && <Text style={[styles.requestMessage, { color: colors.textSecondary }]}>"{item.message}"</Text>}
          <View style={[styles.statusBadge, { backgroundColor: colors.warning + '20' }]}>
            <Text style={[styles.statusText, { color: colors.warning }]}>Pending</Text>
          </View>
        </View>
  <Feather name="send" size={20} color={colors.textSecondary} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  requestItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  requestInfo: { flex: 1, marginLeft: 12 },
  requestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  requesterName: { fontSize: 16, fontWeight: '600' },
  requestTime: { fontSize: 12 },
  requesterUsername: { fontSize: 14, marginTop: 2 },
  requestMessage: { fontSize: 13, fontStyle: 'italic', marginTop: 4 },
  actionButtons: { flexDirection: 'row', gap: 8 },
  acceptButton: { padding: 8, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rejectButton: { padding: 8, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 4 },
  statusText: { fontSize: 12, fontWeight: '500' },
});
