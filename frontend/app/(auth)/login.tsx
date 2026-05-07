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
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Feather } from '@expo/vector-icons';
import { rms, rs, isSmallDevice, maxContentWidth } from '@/utils/responsive';

export default function LoginScreen() {
  const [formData, setFormData] = useState({ login: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = isSmallDevice();
  const isWeb = Platform.OS === 'web';
  const showSplitWeb = isWeb && width >= 1100;

  const sx = (value: number) => (isWeb ? value : rs(value));
  const sm = (value: number) => (isWeb ? value : rms(value));

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null) {
      const maybeError = error as {
        message?: string;
        response?: { data?: { message?: string } };
      };

      if (maybeError.response?.data?.message) {
        return maybeError.response.data.message;
      }
      if (maybeError.message) {
        return maybeError.message;
      }
    }

    return 'An error occurred';
  };

  const handleLogin = async () => {
    if (!formData.login || !formData.password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await login(formData.login, formData.password);

      // ✅ Redirect to main tab stack root after successful login
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert(
        'Login Failed',
        getErrorMessage(error)
      );
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    webShell: {
      width: '100%',
      maxWidth: width >= 1500 ? 1200 : 1080,
      alignSelf: 'center',
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: sx(18),
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    webInfoPanel: {
      flex: 1,
      backgroundColor: colors.background,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      paddingHorizontal: sx(30),
      paddingVertical: sx(32),
      justifyContent: 'center',
      alignItems: 'center',
    },
    webInfoTitle: {
      marginTop: sx(14),
      fontSize: sm(34),
      fontWeight: '700',
      color: colors.text,
    },
    webInfoText: {
      marginTop: sx(10),
      fontSize: sm(16),
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 360,
      lineHeight: sm(24),
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: compact ? sx(20) : sx(28),
      width: '100%',
      maxWidth: isWeb ? (showSplitWeb ? 520 : maxContentWidth(560)) : undefined,
      alignSelf: isWeb ? 'stretch' : undefined,
      backgroundColor: isWeb ? colors.surface : undefined,
      borderWidth: isWeb ? 0 : 0,
      borderColor: isWeb ? colors.border : 'transparent',
      borderRadius: 0,
      paddingVertical: isWeb ? sx(24) : undefined,
      marginVertical: isWeb ? 0 : 0,
    },
    logoContainer: { alignItems: 'center', marginBottom: isWeb ? sx(16) : sx(36) },
    title: {
      fontSize: isWeb ? sm(width >= 1280 ? 44 : 36) : sm(32),
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: sx(8),
      textAlign: 'center',
      width: '100%',
    },
    subtitle: { fontSize: sm(16), color: colors.textSecondary, textAlign: 'center', maxWidth: 380, lineHeight: sm(24) },
    input: {
      backgroundColor: colors.surface,
      borderRadius: sx(12),
      padding: sx(14),
      fontSize: sm(16),
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: sx(14),
    },
    passwordContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: sx(12),
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: sx(14),
      overflow: 'hidden',
    },
    passwordInput: {
      flex: 1,
      padding: sx(14),
      fontSize: sm(16),
      color: colors.text,
      backgroundColor: colors.surface,
      minHeight: sx(52),
    },
    eyeButton: {
      width: sx(52),
      height: sx(52),
      alignItems: 'center',
      justifyContent: 'center',
      borderLeftWidth: 1,
      borderLeftColor: colors.border,
      backgroundColor: colors.surface,
    },
    button: { borderRadius: sx(12), overflow: 'hidden', marginTop: sx(8) },
    buttonContent: { padding: sx(14), alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: 'white', fontSize: sm(18), fontWeight: '600' },
    footer: { alignItems: 'center', marginTop: sx(24) },
    footerText: { color: colors.textSecondary, fontSize: sm(14), textAlign: 'center' },
    linkText: { color: colors.primary, fontWeight: '600' },
    webCard: {
      width: '100%',
      maxWidth: maxContentWidth(560),
      alignSelf: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: sx(18),
      overflow: 'hidden',
    },
  });

  const formContent = (
    <>
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
        <Text style={styles.footerText}>
          Don't have an account?{' '}
          <Link href="/(auth)/register" asChild>
            <Text style={styles.linkText}>Sign up</Text>
          </Link>
        </Text>
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: isWeb ? 'center' : 'flex-start',
          paddingHorizontal: isWeb ? sx(16) : 0,
          paddingVertical: isWeb ? sx(16) : 0,
        }}
      >
        {showSplitWeb ? (
          <View style={styles.webShell}>
            <View style={styles.webInfoPanel}>
              <Feather name="message-circle" size={56} color={colors.primary} />
              <Text style={styles.webInfoTitle}>LChat</Text>
              <Text style={styles.webInfoText}>
                Continue your conversations with a fast and responsive web experience.
              </Text>
            </View>
            <View style={styles.content}>{formContent}</View>
          </View>
        ) : isWeb ? (
          <View style={styles.webCard}>
            <View style={styles.content}>{formContent}</View>
          </View>
        ) : (
          <View style={styles.content}>{formContent}</View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
