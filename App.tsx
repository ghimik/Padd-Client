import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Toast from 'react-native-toast-message';

import CameraScreen from './src/screens/CameraScreen';
import PreviewScreen from './src/screens/PreviewScreen';
import WarpedPreviewScreen from './src/screens/WarpedPreviewScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Camera" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Camera" component={CameraScreen} />
          <Stack.Screen name="Preview" component={PreviewScreen} />
          <Stack.Screen name="WarpedPreviewScreen" component={WarpedPreviewScreen} options={{ animation: 'slide_from_bottom' }}  />
        </Stack.Navigator>
      </NavigationContainer>
      <Toast />
    </>
  );
}

