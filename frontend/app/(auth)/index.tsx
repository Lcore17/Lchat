import { Redirect } from 'expo-router';

export default function AuthIndexScreen() {
	return <Redirect href="/(auth)/login" />;
}
