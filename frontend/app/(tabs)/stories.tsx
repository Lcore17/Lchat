import React, { useState, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { apiService } from '@/services/apiService';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface PollOption {
  id: number;
  text: string;
  votes: number;
}


interface StoryReaction {
  userId: string;
  type: string;
  emoji?: string;
}


type StackedReaction = { count: number; emoji?: string; type: string };

interface Story {
  id: string; // MongoDB _id mapped
  userId?: string;
  user: string;
  content: string;
  imageUri?: string;
  createdAt: number;
  poll?: {
    question: string;
    options: PollOption[];
    votedOptionId?: number;
    votesByUser?: { [userId: string]: number };
  };
  reactions?: StoryReaction[];
  reactionsStacked?: StackedReaction[];
  viewCount?: number;
  viewers?: string[];
}


export default function StoriesScreen() {
  const { user } = useAuth();
  const handleDeleteStory = async (id: string) => {
    try {
      await apiService.delete(`/stories/${id}`);
      setStories(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      Alert.alert('Error', 'Could not delete story');
    }
  };

  // --- Story Editing Logic ---
  const [editModal, setEditModal] = useState<{ visible: boolean; story: Story | null }>({ visible: false, story: null });
  const [editText, setEditText] = useState('');
  const [editImageUri, setEditImageUri] = useState<string | undefined>(undefined);
  const openEditModal = (story: Story) => {
    setEditText(story.content);
    setEditImageUri(story.imageUri);
    setEditModal({ visible: true, story });
  };
  const handleEditStory = async () => {
    if (!editModal.story) return;
    try {
      await apiService.patch(`/stories/${editModal.story.id}`, {
        content: editText,
        imageUri: editImageUri,
      });
      setEditModal({ visible: false, story: null });
      fetchStories();
    } catch (e) {
      Alert.alert('Error', 'Could not edit story');
    }
  };
  const { colors, isDark } = useTheme();
  const [stories, setStories] = useState<Story[]>([]);
  // Fetch stories from backend
    const fetchStories = async () => {
      try {
        const response = await apiService.get('/stories');
        // For each story, if poll.votesByUser contains current user, set votedOptionId
        const userId = user?.id;
        const storiesWithVotes = (response.stories || []).map((story: Story) => {
          if (story.poll && story.poll.votesByUser && userId) {
            const votedOptionId = story.poll.votesByUser[userId];
            return {
              ...story,
              poll: {
                ...story.poll,
                votedOptionId,
              },
            };
          }
          return story;
        });
        setStories(storiesWithVotes);
      } catch (e) {
        // Optionally show error
      }
    };
  useEffect(() => {
    fetchStories();
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      fetchStories();
    }, [])
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [storyText, setStoryText] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  // Remove expired stories (older than 12h)
  const visibleStories = stories.filter(s => Date.now() - s.createdAt < 1000 * 60 * 60 * 12);

  // --- Story View Analytics ---
  const viewedStoryIds = React.useRef<Set<string>>(new Set());
  useEffect(() => {
    visibleStories.forEach(story => {
      if (!viewedStoryIds.current.has(story.id)) {
        apiService.post(`/stories/${story.id}/view`).catch(() => {});
        viewedStoryIds.current.add(story.id);
      }
    });
    // eslint-disable-next-line
  }, [visibleStories.map(s => s.id).join(",")]);

  // Helper for stacked reactions
  type StackedReaction = { count: number; emoji?: string; type: string };

  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStories();
    setRefreshing(false);
  };

  const handleVote = async (storyId: string, optionId: number) => {
    try {
      const res = await apiService.patch(`/stories/${storyId}/vote`, { optionId });
      setStories(prev => prev.map(story => {
        if (story.id === storyId && story.poll) {
          return {
            ...story,
            poll: {
              ...story.poll,
              options: res.poll.options,
              votedOptionId: res.poll.votedOptionId,
            },
          };
        }
        return story;
      }));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not vote');
    }
  };

  const handleAddStory = () => {
    if (!storyText.trim()) {
      Alert.alert('Error', 'Story text cannot be empty');
      return;
    }
    let poll: Story['poll'] = undefined;
    if (pollQuestion.trim() && pollOptions.some(opt => opt.trim())) {
      poll = {
        question: pollQuestion,
        options: pollOptions.filter(opt => opt.trim()).map((opt, idx) => ({ id: idx + 1, text: opt, votes: 0 })),
      };
    }
    // Post story to backend
    apiService.post('/stories', {
      content: storyText,
      imageUri,
      poll,
    }).then(res => {
      fetchStories();
    });
    setStoryText('');
    setPollQuestion('');
    setPollOptions(['', '']);
    setImageUri(undefined);
    setModalVisible(false);
  };


  // --- Story Reaction Logic (Long Press) ---
  const reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '😡'];
  const [reactionModal, setReactionModal] = useState<{ visible: boolean; storyId: string | null }>( { visible: false, storyId: null } );
  const handleLongPressStory = (storyId: string) => {
    setReactionModal({ visible: true, storyId });
  };
  const handleReact = async (storyId: string, emoji: string) => {
    try {
      await apiService.post(`/stories/${storyId}/react`, { type: 'emoji', emoji });
      fetchStories();
      setReactionModal({ visible: false, storyId: null });
    } catch (e) {
      Alert.alert('Error', 'Could not react to story');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: 48, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border }]}> 
        <Text style={[styles.title, { color: colors.text }]}>Stories & Status</Text>
        <View style={styles.addStoryBar}>
          <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addButton}>
            <Feather name="plus-circle" size={24} color={colors.primary} />
            <Text style={[styles.addButtonText, { color: colors.primary }]}>Add Story</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={visibleStories}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.95}
            onLongPress={() => handleLongPressStory(item.id)}
          >
            <View style={[styles.storyCard, { backgroundColor: colors.card }]}> 
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.storyUser, { color: colors.primary }]}>{item.user}</Text>
                {((item.userId && user?.id && item.userId === user.id) || (!item.userId && item.user === (user?.nickname || user?.username))) && (
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity onPress={() => openEditModal(item)} style={{ padding: 4 }}>
                      <Feather name="edit" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteStory(item.id)} style={{ padding: 4 }}>
                      <Feather name="trash-2" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                )}
      {/* Edit Story Modal */}
      <Modal visible={editModal.visible} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}> 
          <View style={[styles.modalContent, { backgroundColor: colors.card, marginBottom: 24 }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Story</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
              placeholder="Edit your story"
              placeholderTextColor={colors.placeholder}
              value={editText}
              onChangeText={setEditText}
            />
            <TouchableOpacity
              onPress={async () => {
                const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!permission.granted) {
                  Alert.alert('Permission required', 'Please allow media library access.');
                  return;
                }
                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  allowsEditing: true,
                  quality: 0.8,
                });
                if (!result.canceled && result.assets && result.assets.length > 0) {
                  setEditImageUri(result.assets[0].uri);
                }
              }}
              style={styles.imagePickerButton}
            >
              <Feather name="image" size={20} color={colors.primary} />
              <Text style={[styles.imagePickerText, { color: colors.primary }]}>Change Photo</Text>
            </TouchableOpacity>
            {editImageUri ? (
              <Image source={{ uri: editImageUri }} style={styles.previewImage} />
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={handleEditStory} style={[styles.modalButton, { backgroundColor: colors.primary }] }>
                <Text style={styles.modalButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditModal({ visible: false, story: null })} style={[styles.modalButton, { backgroundColor: colors.surface }] }>
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
              </View>
              {item.imageUri && (
                <Image source={{ uri: item.imageUri }} style={styles.storyImage} />
              )}
              <Text style={[styles.storyContent, { color: colors.text }]}>{item.content}</Text>
              <Text style={[styles.storyTime, { color: colors.textSecondary }]}>{formatStoryTime(item.createdAt)}</Text>
              {/* Story Analytics: Views */}
              {typeof item.viewCount === 'number' && (
                <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 2 }}>
                  {item.viewCount} view{item.viewCount === 1 ? '' : 's'}
                </Text>
              )}
              {/* Show stacked reactions (if any) */}
              {item.reactionsStacked && item.reactionsStacked.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
                  {item.reactionsStacked.map((r: StackedReaction, idx: number) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
                      <Text style={{ fontSize: 18 }}>{r.emoji || r.type}</Text>
                      <Text style={{ fontSize: 15, marginLeft: 2, color: colors.textSecondary }}>×{r.count}</Text>
                    </View>
                  ))}
                </View>
              )}
              {item.poll && (
                <View style={styles.pollContainer}>
                  <Text style={[styles.pollQuestion, { color: colors.text }]}>{item.poll.question}</Text>
                  {item.poll.options.map(opt => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.pollOption, item.poll && item.poll.votedOptionId === opt.id && styles.pollOptionVoted]}
                      disabled={item.poll && typeof item.poll.votedOptionId !== 'undefined'}
                      onPress={() => handleVote(item.id, opt.id)}
                    >
                      <Text style={[styles.pollOptionText, { color: colors.text }]}>{opt.text} ({opt.votes})</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />

      {/* Reaction Modal for long press */}
      <Modal visible={reactionModal.visible} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' }}>
          <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: 16, padding: 18 }}>
            {reactionEmojis.map(emoji => (
              <TouchableOpacity
                key={emoji}
                style={{ marginHorizontal: 8, padding: 8, borderRadius: 16, backgroundColor: '#eee' }}
                onPress={() => reactionModal.storyId && handleReact(reactionModal.storyId, emoji)}
              >
                <Text style={{ fontSize: 28 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setReactionModal({ visible: false, storyId: null })} style={{ marginTop: 24 }}>
            <Text style={{ color: colors.text, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}> 
          <View style={[styles.modalContent, { backgroundColor: colors.card, marginBottom: 24 }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Story</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.placeholder}
              value={storyText}
              onChangeText={setStoryText}
            />
            <TouchableOpacity
              onPress={async () => {
                const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!permission.granted) {
                  Alert.alert('Permission required', 'Please allow media library access.');
                  return;
                }
                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  allowsEditing: true,
                  quality: 0.8,
                });
                if (!result.canceled && result.assets && result.assets.length > 0) {
                  setImageUri(result.assets[0].uri);
                }
              }}
              style={styles.imagePickerButton}
            >
              <Feather name="image" size={20} color={colors.primary} />
              <Text style={[styles.imagePickerText, { color: colors.primary }]}>Add Photo</Text>
            </TouchableOpacity>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.previewImage} />
            ) : null}
            <Text style={[styles.pollLabel, { color: colors.textSecondary }]}>Add a poll (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
              placeholder="Poll question"
              placeholderTextColor={colors.placeholder}
              value={pollQuestion}
              onChangeText={setPollQuestion}
            />
            {pollOptions.map((opt, idx) => (
              <TextInput
                key={idx}
                style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
                placeholder={`Option ${idx + 1}`}
                placeholderTextColor={colors.placeholder}
                value={opt}
                onChangeText={text => {
                  const newOpts = [...pollOptions];
                  newOpts[idx] = text;
                  setPollOptions(newOpts);
                }}
              />
            ))}
            <TouchableOpacity onPress={() => setPollOptions([...pollOptions, ''])} style={styles.addOptionButton}>
              <Feather name="plus" size={18} color={colors.primary} />
              <Text style={[styles.addOptionText, { color: colors.primary }]}>Add Option</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={handleAddStory} style={[styles.modalButton, { backgroundColor: colors.primary }] }>
                <Text style={styles.modalButtonText}>Post</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.modalButton, { backgroundColor: colors.surface }] }>
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatStoryTime(createdAt: number) {
  const now = Date.now();
  const diff = now - createdAt;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) {
    const date = new Date(createdAt);
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (hours < 24) return `${hours}h ago`;
  return 'Expired';
}

const styles = StyleSheet.create({
  addStoryBar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16, marginBottom: 4 },
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 28, fontWeight: 'bold' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addButtonText: { fontWeight: '600', fontSize: 16 },
  storyCard: { borderRadius: 12, margin: 10, padding: 16, elevation: 2 },
  storyUser: { fontWeight: 'bold', marginBottom: 4, fontSize: 16 },
  storyContent: { fontSize: 16, marginBottom: 8 },
  storyImage: { width: '100%', height: 220, borderRadius: 12, marginBottom: 8 },
  storyTime: { fontSize: 14, marginBottom: 4, fontStyle: 'italic' },
  pollContainer: { marginTop: 8 },
  pollQuestion: { fontWeight: '600', marginBottom: 4, fontSize: 15 },
  pollOption: { borderRadius: 8, padding: 8, marginVertical: 4 },
  pollOptionVoted: { backgroundColor: '#cce5ff' },
  pollOptionText: { fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { borderRadius: 16, padding: 24, width: '90%' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },
  input: { borderRadius: 8, padding: 10, marginVertical: 6 },
  pollLabel: { marginTop: 10, fontWeight: '500' },
  addOptionButton: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  addOptionText: { marginLeft: 4 },
  imagePickerButton: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  imagePickerText: { marginLeft: 6, fontWeight: '500' },
  previewImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  modalButton: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  modalButtonText: { fontWeight: 'bold', fontSize: 16 },
});
