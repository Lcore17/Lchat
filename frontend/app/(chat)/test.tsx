// app/(chat)/test.tsx

import { Text, View } from 'react-native';
import { Link } from 'expo-router';

export default function TestScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' }}>
      <Text style={{ fontSize: 24, color: 'black' }}>
        The (chat) group works!
      </Text>
      <Link href="/">Go Home</Link>
    </View>
  );
}