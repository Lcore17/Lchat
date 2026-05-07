import React, { useState, useCallback, useEffect, useContext, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator, Alert, Image, Linking, ScrollView, Keyboard } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import { apiService } from '@/services/apiService';
import { UserAvatar } from '@/components/UserAvatar';
import VoiceRecorder from '@/components/VoiceRecorder';
import { Audio } from 'expo-av';
import { rms, rs } from '@/utils/responsive';

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

interface ChatPeer {
  id: string;
  name: string;
  username?: string;
  profilePictureUrl?: string | null;
  isOnline?: boolean;
  lastSeen?: string;
}

const SUMMARY_MAX_MESSAGES = 6;
const SUMMARY_CONTEXT_WINDOW = 2;
const SUMMARY_MIN_CHARS = 160;
const SUMMARY_MIN_SENTENCES = 2;
const SUMMARY_MAX_SENTENCES = 3;

const translationMemoryCache: Record<string, string> = {};
const ocrTranslationMemoryCache: Record<string, string> = {};

const getMessageTextForSummary = (msg: IMessage, ocrTextMap: { [id: string]: string | null }) => {
  if (msg.messageType === 'image' && ocrTextMap[msg._id]) {
    return ocrTextMap[msg._id] || '';
  }

  return msg.text || '';
};

const shortenSummaryText = (text: string, maxLength = 160) => {
  const compact = (text || '').replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;

  const sentences = compact.match(/[^.!?]+[.!?]?/g);
  if (sentences && sentences.length > 0) {
    let combined = '';
    for (const sentence of sentences) {
      const next = sentence.trim();
      if (!next) continue;

      const candidate = combined ? `${combined} ${next}` : next;
      if (candidate.length <= maxLength) {
        combined = candidate;
        continue;
      }

      // Keep at least one sentence when the first one is itself very long.
      if (!combined) {
        combined = next;
      }
      break;
    }

    if (combined) {
      if (combined.length <= maxLength) return combined;
      return `${combined.slice(0, maxLength - 1).trimEnd()}…`;
    }
  }

  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
};

const dedupeMessagesById = (items: IMessage[]) => {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item._id)) return false;
    seen.add(item._id);
    return true;
  });
};

const isLikelyMongoObjectId = (value: string) => /^[a-f\d]{24}$/i.test(String(value || ''));

const extractSummaryWindow = (orderedMessages: IMessage[], selectedIds: string[]) => {
  if (orderedMessages.length === 0) return [] as IMessage[];

  const selectedIndexes = orderedMessages
    .map((message, index) => (selectedIds.includes(message._id) ? index : -1))
    .filter(index => index >= 0);

  if (selectedIndexes.length === 0) {
    return orderedMessages.slice(Math.max(0, orderedMessages.length - SUMMARY_MAX_MESSAGES));
  }

  const contiguousGroups: Array<{ start: number; end: number }> = [];
  const sortedIndexes = [...selectedIndexes].sort((a, b) => a - b);
  let start = sortedIndexes[0];
  let end = sortedIndexes[0];

  for (let i = 1; i < sortedIndexes.length; i += 1) {
    const current = sortedIndexes[i];
    if (current === end + 1) {
      end = current;
    } else {
      contiguousGroups.push({ start, end });
      start = current;
      end = current;
    }
  }
  contiguousGroups.push({ start, end });

  const expandedMessages = contiguousGroups.flatMap(group => {
    const windowStart = Math.max(0, group.start - SUMMARY_CONTEXT_WINDOW);
    const windowEnd = Math.min(orderedMessages.length - 1, group.end + SUMMARY_CONTEXT_WINDOW);
    return orderedMessages.slice(windowStart, windowEnd + 1);
  });

  const deduped = dedupeMessagesById(expandedMessages);
  return deduped.slice(Math.max(0, deduped.length - SUMMARY_MAX_MESSAGES));
};

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
  const isWeb = Platform.OS === 'web';
  const webChatWidth = 1100;
  const translationInFlightRef = useRef<Set<string>>(new Set());
  const [translationCacheHydrated, setTranslationCacheHydrated] = useState(false);

  const getTranslationCacheKey = (messageId: string, language: string) =>
    `translation:${messageId}:${language}`;

  const getMemoryCacheKey = (messageId: string, language: string) =>
    `${language}:${messageId}`;

  const readCachedTranslation = async (messageId: string, language: string) => {
    const memoryKey = getMemoryCacheKey(messageId, language);
    if (translationMemoryCache[memoryKey]) {
      return translationMemoryCache[memoryKey];
    }

    try {
      const cached = await SecureStore.getItemAsync(getTranslationCacheKey(messageId, language));
      if (cached) {
        translationMemoryCache[memoryKey] = cached;
      }
      return cached;
    } catch {
      return null;
    }
  };

  const writeCachedTranslation = async (messageId: string, language: string, translatedText: string) => {
    const memoryKey = getMemoryCacheKey(messageId, language);
    translationMemoryCache[memoryKey] = translatedText;

    try {
      await SecureStore.setItemAsync(getTranslationCacheKey(messageId, language), translatedText);
    } catch {
      // Ignore cache write failures silently
    }
  };

  const getInFlightKey = (messageId: string, language: string) => `${messageId}:${language}`;
  const getOcrTranslationCacheKey = (messageId: string, language: string) =>
    `ocr-translation:${messageId}:${language}`;

  const getOcrMemoryCacheKey = (messageId: string, language: string) =>
    `${language}:${messageId}`;

  const readCachedOcrTranslation = async (messageId: string, language: string) => {
    const memoryKey = getOcrMemoryCacheKey(messageId, language);
    if (ocrTranslationMemoryCache[memoryKey]) {
      return ocrTranslationMemoryCache[memoryKey];
    }

    try {
      const cached = await SecureStore.getItemAsync(getOcrTranslationCacheKey(messageId, language));
      if (cached) {
        ocrTranslationMemoryCache[memoryKey] = cached;
      }
      return cached;
    } catch {
      return null;
    }
  };

  const writeCachedOcrTranslation = async (messageId: string, language: string, translatedText: string) => {
    const memoryKey = getOcrMemoryCacheKey(messageId, language);
    ocrTranslationMemoryCache[memoryKey] = translatedText;

    try {
      await SecureStore.setItemAsync(getOcrTranslationCacheKey(messageId, language), translatedText);
    } catch {
      // Ignore cache write failures silently
    }
  };

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryTitle, setSummaryTitle] = useState('Summary');
  const [summaryText, setSummaryText] = useState('');
  const localTypingRef = useRef(false);
  const stopTypingTimeoutRef = useRef<any>(null);
  const otherTypingResetTimeoutRef = useRef<any>(null);
  const [chatPeer, setChatPeer] = useState<ChatPeer | null>(null);

  // Core summarization for any arbitrary text block
  const summarizeTextCore = (text: string): string => {
    const clean = (text || '').trim();
    if (!clean) return '';
    const normalized = clean.replace(/\s+/g, ' ');
    let sentencesRaw = normalized.match(/[^.!?]+[.!?]?/g);
    let sentences: string[] = sentencesRaw ? Array.from(sentencesRaw).map(s => s.trim()).filter(s => s.length > 0) : [normalized];
    const seen = new Set<string>();
    sentences = sentences.filter(s => {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const stopwords = new Set(['the','is','and','a','an','to','of','in','on','for','with','at','by','from','it','this','that','as','are','was','were','be','but','or','if','so','not','do','does','did','has','have','had','can','will','just','about','we','you','i','he','she','they','them','my','your','our','their','me','him','her','us','very','really','actually','also','too','then','than']);
    const wordCounts: Record<string, number> = {};
    sentences.forEach(s => {
      s.toLowerCase().replace(/[^a-z0-9 ]/gi, '').split(/\s+/).forEach(w => {
        if (w.length > 2 && !stopwords.has(w)) wordCounts[w] = (wordCounts[w] || 0) + 1;
      });
    });

    if (sentences.length === 1) {
      const compact = sentences[0].replace(/\s+/g, ' ').trim();
      return compact ? `Summary: ${compact}` : '';
    }

    if (clean.length <= SUMMARY_MIN_CHARS) {
      const shortSummary = sentences
        .slice(0, Math.min(SUMMARY_MIN_SENTENCES, sentences.length))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      return shortSummary ? `Summary: ${shortSummary}` : '';
    }

    const sentenceScores = sentences.map(s => {
      let score = 0;
      s.toLowerCase().replace(/[^a-z0-9 ]/gi, '').split(/\s+/).forEach(w => {
        if (wordCounts[w]) score += wordCounts[w];
      });
      score += Math.max(0, 5 - sentences.indexOf(s));
      return score;
    });
    const rankedIndexes = sentenceScores
      .map((score, idx) => ({ score, idx }))
      .sort((a, b) => b.score - a.score)
      .map(obj => obj.idx);

    const selected = new Set<number>([0]);
    if (sentences.length > 2) {
      selected.add(sentences.length - 1);
    }

    for (const idx of rankedIndexes) {
      if (selected.size >= Math.min(SUMMARY_MAX_SENTENCES, sentences.length)) break;
      selected.add(idx);
    }

    const selectedIndexes = Array.from(selected)
      .sort((a, b) => a - b)
      .slice(0, Math.max(SUMMARY_MIN_SENTENCES, Math.min(SUMMARY_MAX_SENTENCES, sentences.length)));

    const summarySentences = selectedIndexes.map(idx => sentences[idx]);
    const summary = summarySentences.join(' ');
    return summary ? `Summary: ${summary}` : '';
  };

  // Comprehensive summarization across selected messages (now includes OCR text for images)
  function summarizeMessagesFull(selectedMsgs: IMessage[]): string {
    if (selectedMsgs.length === 0) return '';
    const chronologicalMessages = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const orderedSelected = [...selectedMsgs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const summaryWindow = extractSummaryWindow(chronologicalMessages, orderedSelected.map(msg => msg._id));

    const textBlocks = summaryWindow
      .map(message => shortenSummaryText(getMessageTextForSummary(message, ocrTextMap), 220))
      .filter(Boolean);

    if (textBlocks.length === 0) return '';

    if (textBlocks.length <= 2) {
      return `Summary: ${textBlocks.join(' ')}`;
    }

    const synthesisSource = textBlocks.join(' ');

    return summarizeTextCore(synthesisSource);
  }

  // Summarize selected messages (comprehensive)
  const showSummaryResult = (title: string, text: string) => {
    const finalText = text || 'No summary available';

    if (Platform.OS === 'web') {
      setSummaryTitle(title);
      setSummaryText(finalText);
      setSummaryVisible(true);
      return;
    }

    Alert.alert(title, finalText);
  };

  const handleSummarize = () => {
    const selectedMsgs = messages.filter(m => selectedIds.includes(m._id));
    const summary = summarizeMessagesFull(selectedMsgs);
    showSummaryResult('Summary', summary);
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
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}> 
          <Text style={[styles.modalTitle, { color: colors.text }]}>Message Options</Text>
          <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.surface }]} onPress={async () => {
            if (translatedText) {
              await Clipboard.setStringAsync(translatedText);
              Alert.alert('Copied', 'Translated text copied!');
            } else {
              await Clipboard.setStringAsync(selectedMessage.text);
              Alert.alert('Copied', 'Message copied to clipboard');
            }
            setOptionsVisible(false);
          }}>
            <Text style={[styles.modalButtonText, { color: colors.text }]}>Copy</Text>
          </TouchableOpacity>
          {isMyMessage && (
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.surface }]} onPress={() => {
              setEditMessageId(selectedMessage._id);
              setEditText(selectedMessage.text);
              setOptionsVisible(false);
            }}>
              <Text style={[styles.modalButtonText, { color: colors.text }]}>Edit</Text>
            </TouchableOpacity>
          )}
          {isMyMessage && (
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.surface }]} onPress={async () => {
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
          <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.surface }]} onPress={() => setOptionsVisible(false)}>
            <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
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

  useEffect(() => {
    setTranslations({});
    translationInFlightRef.current.clear();
    setTranslationCacheHydrated(false);
    setOcrTranslationMap({});
    setShowOcrMap({});
  }, [conversationId, targetLanguage]);

  const inputBackgroundColor = isDark ? '#2b2d2f' : '#F0F0F0';
  const borderColor = isDark ? '#4B5563' : '#D1D5DB';
  const placeholderColor = isDark ? '#9BA1A6' : '#687076';
  const iconColor = isDark ? '#9BA1A6' : '#687076';

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const fetchChatPeer = async () => {
      if (!conversationId || !currentUser?.id) return;

      try {
        const response = await apiService.get('/messages/conversations/list');
        const conversations = response?.conversations || [];
        const matched = conversations.find((c: any) => String(c.id) === String(conversationId));
        const participant = matched?.participant;

        if (participant) {
          setChatPeer({
            id: participant.id,
            name: participant.nickname || participant.username || params.name || 'Chat',
            username: participant.username,
            profilePictureUrl: participant.profilePictureUrl || null,
            isOnline: participant.isOnline,
            lastSeen: participant.lastSeen,
          });
          return;
        }
      } catch (error) {
        console.error('Failed to fetch conversation participant:', error);
      }

      setChatPeer(prev => prev || {
        id: '',
        name: params.name || 'Chat',
        profilePictureUrl: null,
        isOnline: false,
      });
    };

    fetchChatPeer();
  }, [conversationId, currentUser?.id, params.name]);

  const formatLastSeenHeader = (value?: string) => {
    if (!value) return 'offline';
    const now = Date.now();
    const seen = new Date(value).getTime();
    const diffMins = Math.max(0, Math.floor((now - seen) / (1000 * 60)));
    if (diffMins < 1) return 'last seen just now';
    if (diffMins < 60) return `last seen ${diffMins}m ago`;
    if (diffMins < 1440) return `last seen ${Math.floor(diffMins / 60)}h ago`;
    return `last seen ${Math.floor(diffMins / 1440)}d ago`;
  };

  const getHeaderSubtitle = () => {
    if (isOtherTyping) return 'typing...';
    if (chatPeer?.isOnline) return 'online';
    return formatLastSeenHeader(chatPeer?.lastSeen);
  };

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
    const hydrateTranslationCache = async () => {
      if (!targetLanguage || messages.length === 0 || !currentUser?.id) {
        setTranslationCacheHydrated(true);
        return;
      }

      const hydrated: { [messageId: string]: string } = {};
      const incomingMessages = messages.filter(msg => msg.user._id !== currentUser.id);

      for (const message of incomingMessages) {
        const cached = await readCachedTranslation(message._id, targetLanguage);
        if (cached) {
          hydrated[message._id] = cached;
        }
      }

      if (Object.keys(hydrated).length > 0) {
        setTranslations(prev => ({ ...prev, ...hydrated }));
      }

      setTranslationCacheHydrated(true);
    };

    hydrateTranslationCache();
  }, [messages, targetLanguage, currentUser?.id]);

  useEffect(() => {
    const translateAllVisibleMessages = async () => {
      // Only run if we have messages and the target language is set (including 'en')
      if (targetLanguage && messages.length > 0 && translationCacheHydrated) {
        const candidateMessages = messages.filter(
          msg =>
            msg.user._id !== currentUser?.id &&
            !translations[msg._id] &&
            !translationInFlightRef.current.has(getInFlightKey(msg._id, targetLanguage))
        );

        if (candidateMessages.length === 0) return;

        const cachedTranslations: { [messageId: string]: string } = {};
        const messagesToTranslate: IMessage[] = [];

        for (const message of candidateMessages) {
          const cached = await readCachedTranslation(message._id, targetLanguage);
          if (cached) {
            cachedTranslations[message._id] = cached;
          } else {
            messagesToTranslate.push(message);
          }
        }

        if (Object.keys(cachedTranslations).length > 0) {
          setTranslations(prev => ({ ...prev, ...cachedTranslations }));
        }

        if (messagesToTranslate.length === 0) return;

        console.log(`Translating ${messagesToTranslate.length} visible messages to ${targetLanguage}...`);

        const translationPromises = messagesToTranslate.map(message => {
            const inFlightKey = getInFlightKey(message._id, targetLanguage);
            translationInFlightRef.current.add(inFlightKey);

            return apiService.post('/translate', {
              text: message.text,
              targetLanguage: targetLanguage,
            }).then(response => ({
              messageId: message._id,
              translatedText: response.translated
            })).catch(error => {
              console.error(`Failed to translate message ${message._id}:`, error);
              return null;
            }).finally(() => {
              translationInFlightRef.current.delete(inFlightKey);
            });
          });

        const results = await Promise.all(translationPromises);

        const newTranslations: { [messageId: string]: string } = {};
        for (const result of results) {
          if (result) {
            newTranslations[result.messageId] = result.translatedText;
            await writeCachedTranslation(result.messageId, targetLanguage, result.translatedText);
          }
        }

        if (Object.keys(newTranslations).length > 0) {
          setTranslations(prev => ({ ...prev, ...newTranslations }));
        }
      }
    };
    translateAllVisibleMessages();
  }, [targetLanguage, messages, currentUser?.id, translations, translationCacheHydrated]);

  useEffect(() => {
    const hydrateOcrTranslationCache = async () => {
      if (!targetLanguage || messages.length === 0 || !currentUser?.id) return;

      const hydrated: { [id: string]: string } = {};
      const showMapUpdate: { [id: string]: boolean } = {};

      const candidateImages = messages.filter(
        msg => msg.messageType === 'image' && msg.user._id !== currentUser.id
      );

      for (const message of candidateImages) {
        const cached = await readCachedOcrTranslation(message._id, targetLanguage);
        if (cached) {
          hydrated[message._id] = cached;
          showMapUpdate[message._id] = true;
        }
      }

      if (Object.keys(hydrated).length > 0) {
        setOcrTranslationMap(prev => ({ ...prev, ...hydrated }));
      }

      if (Object.keys(showMapUpdate).length > 0) {
        setShowOcrMap(prev => ({ ...prev, ...showMapUpdate }));
      }
    };

    hydrateOcrTranslationCache();
  }, [messages, targetLanguage, currentUser?.id]);


  // --- Socket Logic ---
  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.emit('joinConversation', conversationId);

    const refreshConversation = async () => {
      try {
        const response = await apiService.get(`/messages/${conversationId}`);
        const formattedMessages = response.messages.map(formatMessage).reverse();
        setMessages(formattedMessages);
      } catch (error) {
        console.error('Failed to refresh conversation:', error);
      }
    };

    const handleNewMessage = (newMessageData: any) => {
      if (newMessageData.conversationId !== conversationId) return;

      const formattedMsg = formatMessage(newMessageData);
      setMessages((previousMessages) => [formattedMsg, ...previousMessages]);

      // If the new message is from someone else and translation is set, translate it
      if (targetLanguage && formattedMsg.user._id !== currentUser?.id) {
        const inFlightKey = getInFlightKey(formattedMsg._id, targetLanguage);
        if (translationInFlightRef.current.has(inFlightKey)) return;

        readCachedTranslation(formattedMsg._id, targetLanguage)
          .then(cached => {
            if (cached) {
              setTranslations(prev => ({ ...prev, [formattedMsg._id]: cached }));
              return null;
            }

            translationInFlightRef.current.add(inFlightKey);
            return apiService.post('/translate', { text: formattedMsg.text, targetLanguage });
          })
          .then(async (response) => {
            if (!response) return;
            const translated = response.translated;
            setTranslations(prev => ({ ...prev, [formattedMsg._id]: translated }));
            await writeCachedTranslation(formattedMsg._id, targetLanguage, translated);
          })
          .catch(error => console.error('Real-time translation failed:', error))
          .finally(() => {
            translationInFlightRef.current.delete(inFlightKey);
          });
      }

      refreshConversation();
    };

    const handleMessageDeleted = (deletedData: { messageId?: string; conversationId?: string }) => {
      if (!deletedData || deletedData.conversationId !== conversationId || !deletedData.messageId) return;
      const messageId = deletedData.messageId;

      setMessages(previousMessages => previousMessages.filter(message => message._id !== messageId));
      setTranslations(previous => {
        if (!previous[messageId]) return previous;
        const next = { ...previous };
        delete next[messageId];
        return next;
      });
    };

    const handleSendMessageError = (errorData: { conversationId?: string; text?: string; message?: string }) => {
      if (!errorData || errorData.conversationId !== conversationId) return;

      if (errorData.text && currentUser?.id) {
        setMessages(previousMessages => {
          const firstOptimisticIndex = previousMessages.findIndex(
            message =>
              message.user._id === currentUser.id &&
              message.text === errorData.text &&
              !isLikelyMongoObjectId(message._id)
          );

          if (firstOptimisticIndex < 0) return previousMessages;

          return previousMessages.filter((_, index) => index !== firstOptimisticIndex);
        });
      }

      Alert.alert('Message failed', errorData.message || 'Could not send message');
    };

    const handleTyping = (typingData: any) => {
      if (!typingData || typingData.conversationId !== conversationId) return;
      if (typingData.userId === currentUser?.id) return;

      setIsOtherTyping(Boolean(typingData.isTyping));

      if (otherTypingResetTimeoutRef.current) {
        clearTimeout(otherTypingResetTimeoutRef.current);
      }

      if (typingData.isTyping) {
        otherTypingResetTimeoutRef.current = setTimeout(() => {
          setIsOtherTyping(false);
        }, 1800);
      }
    };

    const handleUserPresence = (statusData: { userId: string; isOnline: boolean; lastSeen?: string }) => {
      if (!chatPeer?.id || String(statusData.userId) !== String(chatPeer.id)) return;
      setChatPeer(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          isOnline: statusData.isOnline,
          lastSeen: statusData.lastSeen || (statusData.isOnline ? new Date().toISOString() : prev.lastSeen),
        };
      });
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('message_received', handleNewMessage);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('sendMessageError', handleSendMessageError);
    socket.on('typing', handleTyping);
    socket.on('user_online', handleUserPresence);
    
    return () => {
        socket.emit('leaveConversation', conversationId);
        socket.off('newMessage', handleNewMessage);
        socket.off('message_received', handleNewMessage);
      socket.off('message_deleted', handleMessageDeleted);
        socket.off('sendMessageError', handleSendMessageError);
        socket.off('typing', handleTyping);
        socket.off('user_online', handleUserPresence);
        if (otherTypingResetTimeoutRef.current) {
          clearTimeout(otherTypingResetTimeoutRef.current);
        }
    }
  }, [socket, conversationId, targetLanguage, currentUser?.id, chatPeer?.id]);

  const handleInputChange = (text: string) => {
    setInputText(text);

    if (!socket || !conversationId || !currentUser) return;

    const hasText = text.trim().length > 0;

    if (hasText && !localTypingRef.current) {
      localTypingRef.current = true;
      socket.emit('typing', {
        conversationId,
        isTyping: true,
        userName: currentUser.nickname || currentUser.username,
      });
    }

    if (!hasText && localTypingRef.current) {
      localTypingRef.current = false;
      socket.emit('typing', {
        conversationId,
        isTyping: false,
        userName: currentUser.nickname || currentUser.username,
      });
    }

    if (stopTypingTimeoutRef.current) {
      clearTimeout(stopTypingTimeoutRef.current);
    }

    if (hasText) {
      stopTypingTimeoutRef.current = setTimeout(() => {
        if (localTypingRef.current) {
          localTypingRef.current = false;
          socket.emit('typing', {
            conversationId,
            isTyping: false,
            userName: currentUser.nickname || currentUser.username,
          });
        }
      }, 1200);
    }
  };


  // handleSend logic is unchanged
  const handleSend = () => {
    if (inputText.trim().length === 0 || !socket || !currentUser) return;

    if (localTypingRef.current) {
      localTypingRef.current = false;
      socket.emit('typing', {
        conversationId,
        isTyping: false,
        userName: currentUser.nickname || currentUser.username,
      });
    }

    if (stopTypingTimeoutRef.current) {
      clearTimeout(stopTypingTimeoutRef.current);
    }

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
        await writeCachedOcrTranslation(item._id, targetLanguage, response.translated);
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
            maxWidth: isWeb ? '70%' : '80%',
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
                    {!isMyMessage && (
                      <TouchableOpacity style={[styles.summarizeButton, { marginTop: 6 }]} onPress={handleExtractOcr} disabled={ocrLoading}>
                        {ocrLoading ? <ActivityIndicator size={16} color={colors.primary} /> : <Ionicons name="text" size={18} color={colors.primary} />}
                        <Text style={[styles.summarizeButtonText, { color: colors.primary, marginLeft: 6 }]}>Extract</Text>
                      </TouchableOpacity>
                    )}
                    {!isMyMessage && showOcr && (
                      <View style={{ marginTop: 8, backgroundColor: isMyMessage ? colors.primary : inputBackgroundColor, borderRadius: 8, padding: 8 }}>
                        {!ocrTranslation && (
                          <>
                            <Text style={{ fontWeight: 'bold', marginBottom: 2, color: isMyMessage ? '#FFFFFF' : colors.text }}>Extracted Text:</Text>
                            <Text style={{ fontSize: 14, marginBottom: 4, color: isMyMessage ? '#FFFFFF' : colors.text }}>{ocrText}</Text>
                            <TouchableOpacity style={styles.summarizeButton} onPress={handleTranslateOcr} disabled={ocrTranslating}>
                              {ocrTranslating ? <ActivityIndicator size={16} color={colors.primary} /> : <Ionicons name="language" size={18} color={colors.primary} />}
                              <Text style={[styles.summarizeButtonText, { color: colors.primary, marginLeft: 6 }]}>Translate</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.summarizeButton, { marginTop: 6 }]} onPress={() => {
                              const summary = summarizeTextCore(ocrText || '');
                              showSummaryResult('OCR Summary', summary);
                            }}>
                              <Ionicons name="bulb" size={18} color={colors.primary} />
                              <Text style={[styles.summarizeButtonText, { color: colors.primary, marginLeft: 6 }]}>Summarize</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        {ocrTranslation && (
                          <Text style={{ fontSize: 14, marginTop: 2, color: colors.primary }}>
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
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <UserAvatar
                uri={chatPeer?.profilePictureUrl || null}
                name={chatPeer?.name || params.name || 'Chat'}
                size={34}
              />
              <View style={{ marginLeft: rs(8) }}>
                <Text style={{ color: colors.text, fontSize: rms(16), fontWeight: '700' }}>
                  {chatPeer?.name || params.name || 'Chat'}
                </Text>
                <Text style={{ color: isOtherTyping ? colors.primary : colors.textSecondary, fontSize: rms(12) }}>
                  {getHeaderSubtitle()}
                </Text>
              </View>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          data={messages}
          renderItem={renderMessageItem}
          keyExtractor={(item) => item._id}
          style={[styles.messageList, isWeb ? { maxWidth: webChatWidth, alignSelf: 'center', width: '100%' } : null]}
          inverted
        />
        {/* Summarize bar */}
        {selectMode && (
          <View style={[styles.summarizeBar, isWeb ? { maxWidth: webChatWidth, alignSelf: 'center', width: '100%' } : null, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Text style={[styles.summarizeText, { color: colors.text }]}>{selectedIds.length} selected</Text>
            <TouchableOpacity style={[styles.summarizeButton, { backgroundColor: colors.card }]} onPress={handleSummarize} disabled={selectedIds.length === 0}>
              <Ionicons name="bulb" size={20} color={colors.primary} />
              <Text style={[styles.summarizeButtonText, { color: colors.primary }]}>Summarize</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.summarizeCancel} onPress={toggleSelectMode}>
              <Ionicons name="close" size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        )}
        <View style={[styles.inputBarFloating, isWeb ? { maxWidth: webChatWidth, alignSelf: 'center', width: '100%' } : null, { backgroundColor: colors.background, marginBottom: Math.max(insets.bottom, 12) + (Platform.OS === 'android' ? keyboardHeight : 0) }]}> 
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
              onChangeText={handleInputChange}
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
      {summaryVisible && (
        <View style={styles.summaryOverlay}>
          <TouchableOpacity style={styles.summaryBackdrop} onPress={() => setSummaryVisible(false)} />
          <View style={[styles.summaryModal, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={styles.summaryHeader}>
              <Text style={[styles.summaryTitle, { color: colors.text }]}>{summaryTitle}</Text>
              <TouchableOpacity onPress={() => setSummaryVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.summaryBody}>
              <Text style={[styles.summaryContent, { color: colors.text }]}>{summaryText}</Text>
            </ScrollView>
          </View>
        </View>
      )}
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
    paddingVertical: rs(8),
    paddingHorizontal: rs(16),
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  summarizeText: {
    fontSize: rms(15),
    color: '#333',
    fontWeight: '500',
  },
  summarizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FF',
    borderRadius: rs(8),
    paddingHorizontal: rs(12),
    paddingVertical: rs(6),
    marginHorizontal: rs(8),
  },
  summarizeButtonText: {
    fontSize: rms(15),
    fontWeight: '600',
    marginLeft: rs(6),
  },
  summarizeCancel: {
    padding: 6,
    borderRadius: 8,
  },
  summarizeToggle: {
    marginLeft: 8,
    padding: 4,
  },
  summaryOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 120,
  },
  summaryBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  summaryModal: {
    width: '92%',
    maxWidth: rs(680),
    borderRadius: rs(14),
    borderWidth: 1,
    padding: rs(14),
    maxHeight: '72%',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: rs(8),
  },
  summaryTitle: {
    fontSize: rms(18),
    fontWeight: '700',
  },
  summaryBody: {
    maxHeight: rs(420),
  },
  summaryContent: {
    fontSize: rms(15),
    lineHeight: rms(22),
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
    borderRadius: rs(16),
    padding: rs(22),
    minWidth: rs(220),
    alignItems: 'center',
    elevation: 8,
    zIndex: 101,
  },
  modalTitle: {
    fontSize: rms(18),
    fontWeight: 'bold',
    marginBottom: rs(16),
  },
  modalButton: {
    paddingVertical: rs(12),
    paddingHorizontal: rs(24),
    borderRadius: rs(8),
    marginVertical: 4,
    backgroundColor: '#F0F0F0',
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: rms(16),
    color: '#333',
    fontWeight: '500',
  },
  safeArea: { flex: 1 },
  flexOne: { flex: 1 },
  messageList: { flex: 1, paddingHorizontal: rs(10) },
  messageRow: { flexDirection: 'row', marginVertical: rs(5) },
  messageBubble: {
  paddingVertical: rs(10),
  paddingHorizontal: rs(15),
  borderRadius: rs(20),
  maxWidth: '80%',
  alignSelf: 'flex-start',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: rs(10),
    alignItems: 'center',
    borderTopWidth: 1,
  },
  textInput: {
    flex: 1,
    minHeight: rs(40),
    borderRadius: rs(20),
    paddingHorizontal: rs(15),
    marginRight: rs(10),
    paddingVertical: rs(8),
  },
  sendButton: { padding: rs(5) },
  attachButton: {
    padding: rs(6),
    marginRight: rs(6),
  },
  messageText: {
    fontSize: rms(15),
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  imagePreview: {
    width: rs(180),
    height: rs(180),
    borderRadius: rs(12),
    marginBottom: rs(6),
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    maxWidth: rs(220),
    marginBottom: rs(6),
  },
  fileName: {
    marginLeft: rs(6),
    fontSize: rms(14),
    flexShrink: 1,
  },
  originalText: {
    fontSize: rms(12),
    fontStyle: 'italic',
    marginTop: 2,
    opacity: 0.8,
    flexWrap: 'wrap',
  },
  sentimentLabel: {
    fontSize: rms(11),
    opacity: 0.7,
    marginRight: rs(10),
  },
  timeLabel: {
    fontSize: rms(11),
    opacity: 0.7,
  },
});