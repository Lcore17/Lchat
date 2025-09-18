import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Feather } from '@expo/vector-icons';

export default function LoginScreen() {
  const [formData, setFormData] = useState({ login: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  const handleLogin = async () => {
    if (!formData.login || !formData.password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await login(formData.login, formData.password);

      // ✅ Redirect to tabs after successful login
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert(
        'Login Failed',
        error instanceof Error ? error.message : 'An error occurred'
      );
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
    logoContainer: { alignItems: 'center', marginBottom: 48 },
    title: { fontSize: 32, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
    subtitle: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    passwordContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingRight: 16,
      marginBottom: 16,
    },
    passwordInput: { flex: 1, padding: 16, fontSize: 16, color: colors.text },
    eyeButton: { padding: 4 },
    button: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
    buttonContent: { padding: 16, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: 'white', fontSize: 18, fontWeight: '600' },
    footer: { alignItems: 'center', marginTop: 32 },
    linkText: { color: colors.primary, fontWeight: '600' },
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Feather name="message-circle" size={64} color={colors.primary} />
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to continue chatting with friends</Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Email or Username"
            placeholderTextColor={colors.textSecondary}
            value={formData.login}
            onChangeText={(text) => setFormData({ ...formData, login: text })}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            textContentType="username"
            autoCorrect={false}
            importantForAutofill="yes"
            autoComplete="username"
          />

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              value={formData.password}
              onChangeText={(text) => setFormData({ ...formData, password: text })}
              secureTextEntry={!showPassword}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
              {showPassword ? <Feather name="eye-off" size={20} color={colors.textSecondary} /> : <Feather name="eye" size={20} color={colors.textSecondary} />}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.buttonContent}>
              {loading ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.buttonText}>Sign In</Text>}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text>
              Don't have an account?{' '}
              <Link href="/(auth)/register" asChild>
                <Text style={styles.linkText}>Sign up</Text>
              </Link>
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
