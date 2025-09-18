import React, { useState, useCallback, useEffect, useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator, Alert, Image, Linking, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import { apiService } from '@/services/apiService';
import VoiceRecorder from '@/components/VoiceRecorder';
import { Audio } from 'expo-av';

// --- Interfaces ---
interface PollOption {
  id: number;
  text: string;
  votes: number;
}

interface PollData {
  question: string;
  options: PollOption[];
  votedOptionId?: number;
}

interface IMessage {
  _id: string;
  text: string;
  createdAt: Date;
  user: {
    _id: string;
    name?: string;
    avatar?: string;
  };
  sentiment?: string;
  messageType?: 'text' | 'image' | 'file' | 'system' | 'audio';
  fileUrl?: string | null;
  fileName?: string | null;
  poll?: PollData;
}

const formatMessage = (msg: any): IMessage => {
  const senderInfo = msg.sender || msg.senderId;
  const senderId = senderInfo?._id || senderInfo?.id;
  return {
    _id: msg.id || msg._id,
    text: msg.textOriginal,
    createdAt: new Date(msg.createdAt || msg.timestamp),
    user: {
      _id: senderId,
      name: senderInfo?.nickname || 'User',
    },
    sentiment: msg.sentiment || 'neutral',
    messageType: msg.messageType || 'text',
    fileUrl: msg.fileUrl || null,
    fileName: msg.fileName || null,
  };
};

export default function RealChatScreen() {
  const insets = useSafeAreaInsets();

  // Core summarization for any arbitrary text block
  const summarizeTextCore = (text: string): string => {
    const clean = (text || '').trim();
    if (!clean) return '';
    let sentencesRaw = clean.match(/[^.!?]+[.!?]?/g);
    let sentences: string[] = sentencesRaw ? Array.from(sentencesRaw).map(s => s.trim()).filter(s => s.length > 0) : [clean];
    const seen = new Set<string>();
    sentences = sentences.filter(s => {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const stopwords = new Set(['the','is','and','a','an','to','of','in','on','for','with','at','by','from','it','this','that','as','are','was','were','be','but','or','if','so','not','do','does','did','has','have','had','can','will','just','about','we','you','i','he','she','they','them','my','your','our','their','me','him','her','us']);
    const wordCounts: Record<string, number> = {};
    sentences.forEach(s => {
      s.toLowerCase().replace(/[^a-z0-9 ]/gi, '').split(/\s+/).forEach(w => {
        if (w.length > 2 && !stopwords.has(w)) wordCounts[w] = (wordCounts[w] || 0) + 1;
      });
    });
    const sentenceScores = sentences.map(s => {
      let score = 0;
      s.toLowerCase().replace(/[^a-z0-9 ]/gi, '').split(/\s+/).forEach(w => {
        if (wordCounts[w]) score += wordCounts[w];
      });
      score += Math.max(0, 5 - sentences.indexOf(s));
      return score;
    });
    const topIndexes = sentenceScores
      .map((score, idx) => ({ score, idx }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(2, sentences.length))
      .map(obj => obj.idx);
    const summarySentences = topIndexes.sort((a, b) => a - b).map(idx => sentences[idx]);
    const summary = summarySentences.join(' ');
    const keywords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([w]) => w);
    return (keywords.length ? `Main topics: ${keywords.join(', ')}.` : '') + (summary ? `\n${summary}` : '');
  };

  // Comprehensive summarization across selected messages (now includes OCR text for images)
  function summarizeMessagesFull(selectedMsgs: IMessage[]): string {
    if (selectedMsgs.length === 0) return '';
    const combined = selectedMsgs.map(m => {
      // Prefer OCR text if this is an image with extracted text
      // Note: ocrTextMap defined below; this closure will capture the latest value
      const ocrText = ocrTextMap[m._id];
      if (m.messageType === 'image' && ocrText) return ocrText;
      return m.text;
    }).join(' ');
    return summarizeTextCore(combined);
  }

  // Summarize selected messages (comprehensive)
  const handleSummarize = () => {
    const selectedMsgs = messages.filter(m => selectedIds.includes(m._id));
    const summary = summarizeMessagesFull(selectedMsgs);
    Alert.alert('Summary', summary || 'No summary available');
  };
  // Selection state for summarization
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Toggle selection mode
  const toggleSelectMode = () => {
    setSelectMode((prev) => !prev);
    setSelectedIds([]);
  };

  // Select/deselect a message
  const handleSelectMessage = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((mid) => mid !== id) : [...prev, id]
    );
  };
  // Modal state for message options
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<IMessage | null>(null);

  // Modal for message options
  const renderOptionsModal = () => {
    if (!selectedMessage) return null;
    const isMyMessage = selectedMessage.user._id === currentUser?.id;
    const translatedText = translations[selectedMessage._id];
    return (
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Message Options</Text>
          <TouchableOpacity style={styles.modalButton} onPress={async () => {
            if (translatedText) {
              await Clipboard.setStringAsync(translatedText);
              Alert.alert('Copied', 'Translated text copied!');
            } else {
              await Clipboard.setStringAsync(selectedMessage.text);
              Alert.alert('Copied', 'Message copied to clipboard');
            }
            setOptionsVisible(false);
          }}>
            <Text style={styles.modalButtonText}>Copy</Text>
          </TouchableOpacity>
          {isMyMessage && (
            <TouchableOpacity style={styles.modalButton} onPress={() => {
              setEditMessageId(selectedMessage._id);
              setEditText(selectedMessage.text);
              setOptionsVisible(false);
            }}>
              <Text style={styles.modalButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
          {isMyMessage && (
            <TouchableOpacity style={styles.modalButton} onPress={async () => {
              try {
                await apiService.delete(`/messages/${selectedMessage._id}`);
                setMessages(prev => prev.filter(m => m._id !== selectedMessage._id));
                setOptionsVisible(false);
                Alert.alert('Deleted', 'Message deleted');
              } catch (e: any) {
                setOptionsVisible(false);
                Alert.alert('Delete failed', e.message || 'Could not delete message');
              }
            }}>
              <Text style={[styles.modalButtonText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.modalButton} onPress={() => setOptionsVisible(false)}>
            <Text style={styles.modalButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.modalBackdrop} onPress={() => setOptionsVisible(false)} />
      </View>
    );
  };
  const params = useLocalSearchParams<{ conversationId: string; name: string }>();
  const { colors, isDark } = useTheme();
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();

  // --- State Management ---
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [editMessageId, setEditMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [uploading, setUploading] = useState(false);
  
  // ✅ NEW: A state to hold our on-demand translations
  const [translations, setTranslations] = useState<{ [messageId: string]: string }>({});

  // OCR and translation state per message
  const [ocrTextMap, setOcrTextMap] = useState<{ [id: string]: string | null }>({});
  const [ocrLoadingMap, setOcrLoadingMap] = useState<{ [id: string]: boolean }>({});
  const [showOcrMap, setShowOcrMap] = useState<{ [id: string]: boolean }>({});
  const [ocrTranslationMap, setOcrTranslationMap] = useState<{ [id: string]: string | null }>({});
  const [ocrTranslatingMap, setOcrTranslatingMap] = useState<{ [id: string]: boolean }>({});
  
  const conversationId = params.conversationId;
  // Get the user's preferred language from the global AuthContext
  const targetLanguage = currentUser?.preferences.defaultTranslateLanguage || 'en';

  const inputBackgroundColor = isDark ? '#2b2d2f' : '#F0F0F0';
  const borderColor = isDark ? '#4B5563' : '#D1D5DB';
  const placeholderColor = isDark ? '#9BA1A6' : '#687076';
  const iconColor = isDark ? '#9BA1A6' : '#687076';

  // --- Data Fetching ---
  useEffect(() => {
    const fetchMessages = async () => {
      if (!conversationId) return;
      setLoading(true);
      try {
        const response = await apiService.get(`/messages/${conversationId}`);
        const formattedMessages = response.messages.map(formatMessage).reverse();
        setMessages(formattedMessages);
      } catch (error) {
        console.error('Failed to fetch messages:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, [conversationId]);
  
  // --- ✅ NEW: Effect to fetch translations when messages load or language changes ---
  useEffect(() => {
    const translateAllVisibleMessages = async () => {
      // Only run if we have messages and the target language is set (including 'en')
      if (targetLanguage && messages.length > 0) {
        const messagesToTranslate = messages.filter(
          msg => msg.user._id !== currentUser?.id && !translations[msg._id]
        );

        if (messagesToTranslate.length === 0) return;

        console.log(`Translating ${messagesToTranslate.length} visible messages to ${targetLanguage}...`);

        const translationPromises = messagesToTranslate.map(message => 
            apiService.post('/translate', {
              text: message.text,
              targetLanguage: targetLanguage,
            }).then(response => ({
              messageId: message._id,
              translatedText: response.translated
            })).catch(error => {
              console.error(`Failed to translate message ${message._id}:`, error);
              return null;
            })
          );

        const results = await Promise.all(translationPromises);

        const newTranslations: { [messageId: string]: string } = {};
        results.forEach(result => {
          if (result) {
            newTranslations[result.messageId] = result.translatedText;
          }
        });

        if (Object.keys(newTranslations).length > 0) {
          setTranslations(prev => ({ ...prev, ...newTranslations }));
        }
      }
    };
    translateAllVisibleMessages();
  }, [targetLanguage, messages, currentUser?.id]);


  // --- Socket Logic ---
  useEffect(() => {
    if (!socket || !conversationId) return;

    const handleNewMessage = (newMessageData: any) => {
      if (newMessageData.conversationId !== conversationId) return;

      const formattedMsg = formatMessage(newMessageData);
      setMessages((previousMessages) => [formattedMsg, ...previousMessages]);

      // If the new message is from someone else and translation is set, translate it
      if (targetLanguage && formattedMsg.user._id !== currentUser?.id) {
        apiService.post('/translate', { text: formattedMsg.text, targetLanguage })
          .then(response => {
            setTranslations(prev => ({ ...prev, [formattedMsg._id]: response.translated }));
          })
          .catch(error => console.error('Real-time translation failed:', error));
      }
    };

    socket.on('newMessage', handleNewMessage);
    
    return () => {
        socket.off('newMessage', handleNewMessage);
    }
  }, [socket, conversationId, targetLanguage, currentUser?.id]);


  // handleSend logic is unchanged
  const handleSend = () => {
    if (inputText.trim().length === 0 || !socket || !currentUser) return;

    const optimisticMessage: IMessage = {
      _id: Math.random().toString(),
      text: inputText,
      createdAt: new Date(),
      user: {
        _id: currentUser.id,
        name: currentUser.nickname || currentUser.username,
        avatar: currentUser.profilePictureUrl ?? undefined,
      },
    };
    setMessages(previousMessages => [optimisticMessage, ...previousMessages]);

    socket.emit('sendMessage', { conversationId, text: inputText });
    setInputText('');
  };

    // Voice message state
    const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
    const [audioSound, setAudioSound] = useState<Audio.Sound | null>(null);
    // Audio translation state
    const [audioTranscripts, setAudioTranscripts] = useState<{ [id: string]: string }>({});
    const [audioTranslations, setAudioTranslations] = useState<{ [id: string]: string }>({});
    const [audioTranslatingId, setAudioTranslatingId] = useState<string | null>(null);

    // Translate audio handler
    const handleTranslateAudio = async (item: IMessage) => {
      if (!item.fileUrl || !item._id) return;
      setAudioTranslatingId(item._id);
      try {
        const fileName = item.fileUrl.split('/').pop();
        const response = await apiService.post('/audio/transcribe-and-translate', {
          audioPath: fileName,
          targetLanguage,
        });
        setAudioTranscripts(prev => ({ ...prev, [item._id]: response.transcript }));
        setAudioTranslations(prev => ({ ...prev, [item._id]: response.translation }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not translate audio';
        Alert.alert('Audio translation failed', msg);
      } finally {
        setAudioTranslatingId(null);
      }
    };

  // Play audio message
  const handlePlayAudio = async (fileUrl: string, messageId: string) => {
    try {
      // Always create a new sound object for each play
      if (audioSound) {
        await audioSound.stopAsync();
        await audioSound.unloadAsync();
        setAudioSound(null);
      }
      const { sound } = await Audio.Sound.createAsync({ uri: apiService['baseURL'] + fileUrl });
      setAudioSound(sound);
      setPlayingAudioId(messageId);
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate(async status => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingAudioId(null);
          await sound.unloadAsync();
          setAudioSound(null);
        }
      });
    } catch (e) {
      Alert.alert('Audio error', 'Could not play audio');
    }
  };

  // Send voice message
  const handleSendVoice = async (audioUri: string) => {
    if (!conversationId || !currentUser) return;
    try {
      setUploading(true);
      const file = {
        uri: audioUri,
        name: `voice-${Date.now()}.m4a`,
        type: 'audio/m4a',
      };
      const res = await apiService.uploadFile(`/messages/${conversationId}/attachment`, file, {
        fieldName: 'file',
        extraFields: { messageType: 'audio' },
      });
      const newMsg = formatMessage(res.message);
      setMessages(prev => [newMsg, ...prev]);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message || 'Could not upload voice message');
    } finally {
      setUploading(false);
    }
  };
  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please allow media library access.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await uploadAttachment({
          uri: asset.uri,
          name: asset.fileName || `image-${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        }, 'image');
      }
    } catch (e) {
      console.error('Pick image error', e);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      await uploadAttachment({
        uri: asset.uri,
        name: asset.name || `file-${Date.now()}.pdf`,
        type: asset.mimeType || 'application/pdf',
      }, 'file');
    } catch (e) {
      console.error('Pick document error', e);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const uploadAttachment = async (
    file: { uri: string; name: string; type: string },
    kind: 'image' | 'file'
  ) => {
    if (!conversationId || !currentUser) return;
    try {
      setUploading(true);
      const res = await apiService.uploadFile(`/messages/${conversationId}/attachment`, file, {
        fieldName: 'file',
      });
      // Optimistically insert
      const newMsg = formatMessage(res.message);
      setMessages(prev => [newMsg, ...prev]);
    } catch (e: any) {
      console.error('Upload attachment error', e);
      Alert.alert('Upload failed', e.message || 'Could not upload attachment');
    } finally {
      setUploading(false);
    }
  };

  // ✅ Updated render logic to use the `translations` state
  // ✅ Updated render logic to use the `translations` state
  const renderMessageItem = ({ item }: { item: IMessage }) => {
    const isMyMessage = item.user._id === currentUser?.id;
    const translatedText = translations[item._id];
    const normalizedSentiment = (item.sentiment || 'neutral').toString().trim().toLowerCase();
    let sentimentEmoji = '';
    if (normalizedSentiment === 'positive') sentimentEmoji = '😊';
    else if (normalizedSentiment === 'negative') sentimentEmoji = '😞';
    else sentimentEmoji = '😐';

    // Format time as HH:mm
    const messageTime = item.createdAt instanceof Date
      ? item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Render based on message type
  const isImage = item.messageType === 'image' && item.fileUrl;
  const isFile = item.messageType === 'file' && item.fileUrl;
  const isAudio = item.messageType === 'audio' && item.fileUrl;

    // OCR state from top-level
    const ocrText = ocrTextMap[item._id] || null;
    const ocrLoading = ocrLoadingMap[item._id] || false;
    const showOcr = showOcrMap[item._id] || false;
    const ocrTranslation = ocrTranslationMap[item._id] || null;
    const ocrTranslating = ocrTranslatingMap[item._id] || false;

    // OCR extract handler
    const handleExtractOcr = async () => {
      setOcrLoadingMap(prev => ({ ...prev, [item._id]: true }));
      try {
        const fileName = item.fileUrl?.split('/').pop();
        const response = await apiService.post('/ocr/extract', { imagePath: fileName });
        setOcrTextMap(prev => ({ ...prev, [item._id]: response.text }));
        setShowOcrMap(prev => ({ ...prev, [item._id]: true }));
      } catch (e) {
        const msg = typeof e === 'object' && e !== null && 'message' in e ? (e as any).message : String(e);
        Alert.alert('OCR failed', msg || 'Could not extract text');
      } finally {
        setOcrLoadingMap(prev => ({ ...prev, [item._id]: false }));
      }
    };

    // Translate extracted OCR text
    const handleTranslateOcr = async () => {
      if (!ocrText) return;
      setOcrTranslatingMap(prev => ({ ...prev, [item._id]: true }));
      try {
        const response = await apiService.post('/translate', { text: ocrText, targetLanguage });
        setOcrTranslationMap(prev => ({ ...prev, [item._id]: response.translated }));
      } catch (e) {
        const msg = typeof e === 'object' && e !== null && 'message' in e ? (e as any).message : String(e);
        Alert.alert('Translation failed', msg || 'Could not translate text');
      } finally {
        setOcrTranslatingMap(prev => ({ ...prev, [item._id]: false }));
      }
    };

    // Long press handler for this item
    const handleLongPress = () => {
      if (selectMode) {
        handleSelectMessage(item._id);
      } else {
        setSelectedMessage(item);
        setOptionsVisible(true);
      }
    };

    // Tap to select in select mode
    const handlePress = () => {
      if (selectMode) {
        handleSelectMessage(item._id);
      }
    };

    // If editing this message
    if (editMessageId === item._id) {
      return (
        <View style={[ styles.messageRow, { justifyContent: 'flex-end' } ]}>
          <View style={[ styles.messageBubble, { backgroundColor: colors.primary } ]}>
            <TextInput
              style={[styles.textInput, { color: colors.text, backgroundColor: inputBackgroundColor, marginBottom: 8 }]}
              value={editText}
              onChangeText={setEditText}
              autoFocus
              multiline
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: colors.error, borderRadius: 12, marginRight: 8 }]}
                onPress={() => { setEditMessageId(null); setEditText(''); }}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: colors.primary, borderRadius: 12 }]}
                onPress={async () => {
                  try {
                    const res = await apiService.patch(`/messages/${item._id}`, { text: editText });
                    setMessages(prev => prev.map(m => m._id === item._id ? { ...m, text: editText } : m));
                    setEditMessageId(null);
                    setEditText('');
                  } catch (e: any) {
                    Alert.alert('Edit failed', e.message || 'Could not edit message');
                  }
                }}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={[ styles.messageRow, { justifyContent: isMyMessage ? 'flex-end' : 'flex-start' } ]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={handleLongPress}
          onPress={handlePress}
          style={{ flex: 1, alignItems: isMyMessage ? 'flex-end' : 'flex-start' }}
        >
          <View style={[ styles.messageBubble, {
            backgroundColor: selectMode && selectedIds.includes(item._id)
              ? colors.primary + '80'
              : isMyMessage ? colors.primary : inputBackgroundColor,
            alignSelf: isMyMessage ? 'flex-end' : 'flex-start',
            borderWidth: selectMode && selectedIds.includes(item._id) ? 2 : 0,
            borderColor: selectMode && selectedIds.includes(item._id) ? colors.primary : 'transparent',
          } ]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              {selectMode && selectedIds.includes(item._id) && (
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={{ marginRight: 6 }} />
              )}
              {sentimentEmoji && (
                <Text style={{ marginRight: 6 }}>{sentimentEmoji}</Text>
              )}
              <View style={{ flexShrink: 1 }}>
                {isImage && (
                  <View>
                    <TouchableOpacity onPress={() => item.fileUrl && Linking.openURL(apiService['baseURL'] + item.fileUrl)}>
                      <Image source={{ uri: apiService['baseURL'] + item.fileUrl! }} style={styles.imagePreview} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.summarizeButton, { marginTop: 6 }]} onPress={handleExtractOcr} disabled={ocrLoading}>
                      {ocrLoading ? <ActivityIndicator size={16} color={colors.primary} /> : <Ionicons name="text" size={18} color={colors.primary} />}
                      <Text style={[styles.summarizeButtonText, { color: colors.primary, marginLeft: 6 }]}>Extract</Text>
                    </TouchableOpacity>
                    {showOcr && (
                      <View style={{ marginTop: 8, backgroundColor: isMyMessage ? colors.primary : inputBackgroundColor, borderRadius: 8, padding: 8 }}>
                        <Text style={{ fontWeight: 'bold', marginBottom: 2, color: isMyMessage ? '#FFFFFF' : colors.text }}>Extracted Text:</Text>
                        <Text style={{ fontSize: 14, marginBottom: 4, color: isMyMessage ? '#FFFFFF' : colors.text }}>{ocrText}</Text>
                        <TouchableOpacity style={styles.summarizeButton} onPress={handleTranslateOcr} disabled={ocrTranslating}>
                          {ocrTranslating ? <ActivityIndicator size={16} color={colors.primary} /> : <Ionicons name="language" size={18} color={colors.primary} />}
                          <Text style={[styles.summarizeButtonText, { color: colors.primary, marginLeft: 6 }]}>Translate</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.summarizeButton, { marginTop: 6 }]} onPress={() => {
                          const summary = summarizeTextCore(ocrText || '');
                          Alert.alert('OCR Summary', summary || 'No summary available');
                        }}>
                          <Ionicons name="bulb" size={18} color={colors.primary} />
                          <Text style={[styles.summarizeButtonText, { color: colors.primary, marginLeft: 6 }]}>Summarize</Text>
                        </TouchableOpacity>
                        {ocrTranslation && (
                          <Text style={{ fontSize: 14, marginTop: 4, color: colors.primary }}>
                            Translation: {ocrTranslation}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                )}
                {isFile && (
                  <TouchableOpacity style={styles.fileRow} onPress={() => item.fileUrl && Linking.openURL(apiService['baseURL'] + item.fileUrl)}>
                    <Ionicons name="document-attach" size={18} color={isMyMessage ? '#FFFFFF' : colors.text} />
                    <Text style={[styles.fileName, { color: isMyMessage ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
                      {item.fileName || 'Attachment'}
                    </Text>
                  </TouchableOpacity>
                )}
                {isAudio && (
                  <View style={{ marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isMyMessage ? colors.primary : inputBackgroundColor, borderRadius: 12, padding: 8 }}>
                      <TouchableOpacity onPress={() => handlePlayAudio(item.fileUrl!, item._id)} style={{ padding: 6 }}>
                        <Ionicons name={playingAudioId === item._id ? 'pause' : 'play'} size={24} color={isMyMessage ? '#fff' : colors.primary} />
                      </TouchableOpacity>
                      <Text style={{ color: isMyMessage ? '#fff' : colors.text, marginLeft: 8 }}>Voice message</Text>
                      <TouchableOpacity style={[styles.summarizeButton, { marginLeft: 8 }]} onPress={() => handleTranslateAudio(item)} disabled={audioTranslatingId === item._id}>
                        {audioTranslatingId === item._id ? <ActivityIndicator size={16} color={colors.primary} /> : <Ionicons name="language" size={18} color={colors.primary} />}
                        <Text style={[styles.summarizeButtonText, { color: colors.primary, marginLeft: 6 }]}>Translate</Text>
                      </TouchableOpacity>
                    </View>
                    {audioTranscripts[item._id] && (
                      <View style={{ marginTop: 6, backgroundColor: isMyMessage ? colors.primary : inputBackgroundColor, borderRadius: 8, padding: 8 }}>
                        <Text style={{ fontWeight: 'bold', marginBottom: 2, color: isMyMessage ? '#fff' : colors.text }}>Transcript:</Text>
                        <Text style={{ fontSize: 14, marginBottom: 4, color: isMyMessage ? '#fff' : colors.text }}>{audioTranscripts[item._id]}</Text>
                        {audioTranslations[item._id] && (
                          <Text style={{ fontWeight: 'bold', marginBottom: 2, color: isMyMessage ? '#fff' : colors.primary }}>Translation:</Text>
                        )}
                        {audioTranslations[item._id] && (
                          <Text style={{ fontSize: 14, color: isMyMessage ? '#fff' : colors.primary }}>{audioTranslations[item._id]}</Text>
                        )}
                      </View>
                    )}
                  </View>
                )}
                {!isImage && !isFile && translatedText ? (
                  <>
                    <View style={{ maxHeight: 180, marginBottom: 2, backgroundColor: isMyMessage ? colors.primary : inputBackgroundColor, borderRadius: 8 }}>
                      <ScrollView>
                        <Text style={[styles.messageText, { color: isMyMessage ? '#FFFFFF' : colors.text }]}>
                          {translatedText}
                        </Text>
                      </ScrollView>
                    </View>
                    <Text style={[styles.originalText, {color: isMyMessage ? '#E0E0E0' : iconColor}]}> 
                      (Original: {item.text})
                    </Text>
                  </>
                ) : (!isImage && !isFile && (
                  <Text style={[styles.messageText, { color: isMyMessage ? '#FFFFFF' : colors.text }]}>{item.text}</Text>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text style={[styles.sentimentLabel, { color: isMyMessage ? '#E0E0E0' : iconColor }]}> 
                Sentiment: {normalizedSentiment.charAt(0).toUpperCase() + normalizedSentiment.slice(1)}
              </Text>
              <Text style={[styles.timeLabel, { color: isMyMessage ? '#E0E0E0' : iconColor }]}>{messageTime}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };
  
  if (loading) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background}}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}> 
      <Stack.Screen options={{ headerTitle: params.name || 'Chat' }} />
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          data={messages}
          renderItem={renderMessageItem}
          keyExtractor={(item) => item._id}
          style={styles.messageList}
          inverted
        />
        {/* Summarize bar */}
        {selectMode && (
          <View style={styles.summarizeBar}>
            <Text style={styles.summarizeText}>{selectedIds.length} selected</Text>
            <TouchableOpacity style={styles.summarizeButton} onPress={handleSummarize} disabled={selectedIds.length === 0}>
              <Ionicons name="bulb" size={20} color={colors.primary} />
              <Text style={[styles.summarizeButtonText, { color: colors.primary }]}>Summarize</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.summarizeCancel} onPress={toggleSelectMode}>
              <Ionicons name="close" size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        )}
        <View style={[styles.inputBarFloating, { backgroundColor: colors.background, marginBottom: Math.max(insets.bottom, 12) }]}> 
          <View style={[styles.inputContainer, { borderTopColor: borderColor, backgroundColor: colors.background, borderRadius: 24, elevation: 8 }]}> 
            <TouchableOpacity onPress={handlePickImage} style={styles.attachButton} disabled={uploading}>
              <Ionicons name="image" size={24} color={iconColor} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickDocument} style={styles.attachButton} disabled={uploading}>
              <Ionicons name="attach" size={24} color={iconColor} />
            </TouchableOpacity>
            <VoiceRecorder onSend={handleSendVoice} disabled={uploading} />
            <TextInput
              style={[styles.textInput, { color: isDark ? '#fff' : colors.text, backgroundColor: inputBackgroundColor, borderWidth: 1, borderColor: borderColor }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type a message..."
              placeholderTextColor={isDark ? '#ccc' : placeholderColor}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                handleSend();
              }}
            />
            <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
              <Ionicons name="send" size={24} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleSelectMode} style={styles.summarizeToggle}>
              <Ionicons name={selectMode ? "close-circle" : "bulb-outline"} size={22} color={selectMode ? colors.error : colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      {/* Modal for message options */}
      {optionsVisible && renderOptionsModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  inputBarFloating: {
    width: '100%',
    paddingHorizontal: 0,
    marginBottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  inputSafeArea: {
    backgroundColor: '#fff',
  },
  summarizeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F8F8',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  summarizeText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  summarizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 8,
  },
  summarizeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  summarizeCancel: {
    padding: 6,
    borderRadius: 8,
  },
  summarizeToggle: {
    marginLeft: 8,
    padding: 4,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    minWidth: 220,
    alignItems: 'center',
    elevation: 8,
    zIndex: 101,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginVertical: 4,
    backgroundColor: '#F0F0F0',
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  safeArea: { flex: 1 },
  flexOne: { flex: 1 },
  messageList: { flex: 1, paddingHorizontal: 10 },
  messageRow: { flexDirection: 'row', marginVertical: 5 },
  messageBubble: {
  paddingVertical: 10,
  paddingHorizontal: 15,
  borderRadius: 20,
  maxWidth: '80%',
  alignSelf: 'flex-start',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 15,
    marginRight: 10,
    paddingVertical: 8,
  },
  sendButton: { padding: 5 },
  attachButton: {
    padding: 6,
    marginRight: 6,
  },
  messageText: {
    fontSize: 15,
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  imagePreview: {
    width: 180,
    height: 180,
    borderRadius: 12,
    marginBottom: 6,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 220,
    marginBottom: 6,
  },
  fileName: {
    marginLeft: 6,
    fontSize: 14,
    flexShrink: 1,
  },
  originalText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
    opacity: 0.8,
    flexWrap: 'wrap',
  },
  sentimentLabel: {
    fontSize: 11,
    opacity: 0.7,
    marginRight: 10,
  },
  timeLabel: {
    fontSize: 11,
    opacity: 0.7,
  },
});