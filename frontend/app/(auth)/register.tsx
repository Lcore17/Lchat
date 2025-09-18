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

export default function RegisterScreen() {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    nickname: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  const handleRegister = async () => {
    if (!formData.email || !formData.username || !formData.password) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    try {
      await register({
        email: formData.email,
        username: formData.username,
        password: formData.password,
        nickname: formData.nickname || formData.username,
      });

      // ✅ Redirect to tabs after successful registration
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert(
        'Registration Failed',
        error instanceof Error ? error.message : 'An error occurred'
      );
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48 },
    logoContainer: { alignItems: 'center', marginBottom: 32 },
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
    footer: { alignItems: 'center', marginTop: 24 },
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
            <Feather name="user" size={64} color={colors.primary} />
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join LChat and start connecting with friends</Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor={colors.textSecondary}
            value={formData.email}
            onChangeText={(text) => setFormData({ ...formData, email: text })}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            textContentType="emailAddress"
            autoCorrect={false}
            importantForAutofill="yes"
            autoComplete="email"
          />

          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor={colors.textSecondary}
            value={formData.username}
            onChangeText={(text) => setFormData({ ...formData, username: text })}
            autoCapitalize="none"
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            placeholder="Display Name (Optional)"
            placeholderTextColor={colors.textSecondary}
            value={formData.nickname}
            onChangeText={(text) => setFormData({ ...formData, nickname: text })}
            returnKeyType="next"
          />

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              value={formData.password}
              onChangeText={(text) => setFormData({ ...formData, password: text })}
              secureTextEntry={!showPassword}
              returnKeyType="next"
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
              {showPassword ? <Feather name="eye-off" size={20} color={colors.textSecondary} /> : <Feather name="eye" size={20} color={colors.textSecondary} />}
            </TouchableOpacity>
          </View>

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Confirm Password"
              placeholderTextColor={colors.textSecondary}
              value={formData.confirmPassword}
              onChangeText={(text) => setFormData({ ...formData, confirmPassword: text })}
              secureTextEntry={!showConfirmPassword}
              returnKeyType="go"
              onSubmitEditing={handleRegister}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
              {showConfirmPassword ? <Feather name="eye-off" size={20} color={colors.textSecondary} /> : <Feather name="eye" size={20} color={colors.textSecondary} />}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
            <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.buttonContent}>
              {loading ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.buttonText}>Create Account</Text>}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text>
              Already have an account?{' '}
              <Link href="/(auth)/login" asChild>
                <Text style={styles.linkText}>Sign in</Text>
              </Link>
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
