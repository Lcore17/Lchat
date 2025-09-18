import React, { useState } from 'react';
import { View, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';

import { Ionicons } from '@expo/vector-icons';

interface VoiceRecorderProps {
	onSend: (audioUri: string) => void;
	disabled?: boolean;
}

import { useTheme } from '@/context/ThemeContext';

export default function VoiceRecorder({ onSend, disabled }: VoiceRecorderProps) {
	const [recording, setRecording] = useState<Audio.Recording | null>(null);
	const [isRecording, setIsRecording] = useState(false);
	const [loading, setLoading] = useState(false);
	const { colors, isDark } = useTheme();

	const startRecording = async () => {
		setLoading(true);
		try {
			await Audio.requestPermissionsAsync();
			await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
			const rec = new Audio.Recording();
			await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
			await rec.startAsync();
			setRecording(rec);
			setIsRecording(true);
		} catch (e) {
			alert('Could not start recording: ' + e);
		}
		setLoading(false);
	};

	const stopRecording = async () => {
		setLoading(true);
		try {
			if (!recording) return;
			await recording.stopAndUnloadAsync();
			const uri = recording.getURI();
			setRecording(null);
			setIsRecording(false);
			if (uri) onSend(uri);
		} catch (e) {
			alert('Could not stop recording: ' + e);
		}
		setLoading(false);
	};

	return (
		<TouchableOpacity
			onPress={isRecording ? stopRecording : startRecording}
			disabled={disabled || loading}
			style={{ padding: 8 }}
		>
					{loading ? (
						<ActivityIndicator size={20} />
					) : (
						<Ionicons name={isRecording ? 'stop' : 'mic'} size={28} color={isRecording ? 'red' : colors.primary} />
					)}
		</TouchableOpacity>
	);
}
