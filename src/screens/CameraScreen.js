import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  Modal,
  Switch,
  Platform
} from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { detectCorners, getRotationAngle } from '../api';
import ImageResizer from 'react-native-image-resizer';

const CameraScreen = ({ navigation }) => {
  const device = useCameraDevice('back');
  const camera = useRef(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isFlashVisible, setIsFlashVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  useEffect(() => {
    const requestPermission = async () => {
      const permission = await Camera.requestCameraPermission();
      setHasPermission(permission === 'granted');
      if (permission === 'denied') {
        Alert.alert('Ошибка', 'Нужен доступ к камере');
      }
    };
    requestPermission();
  }, []);

  const takePhoto = async () => {
    if (camera.current == null) return;

    try {
      const photo = await camera.current.takePhoto({
        flash: 'off',
        qualityPrioritization: 'quality',
      });
      
      let imageUri = 'file://' + photo.path;
      
      setIsFlashVisible(true);

      let finalWidth = 0;
      let finalHeight = 0;
      let finalUri = imageUri;
      let rotation = 0;

      if (autoRotate) {
        try {
          console.log('Проверяем угол поворота...');
          const rotationData = await getRotationAngle(imageUri);
          rotation = rotationData.angle;
          console.log(`Угол поворота: ${rotation}`);
        } catch (e) {
          console.warn('Не удалось определить угол, оставляем 0', e);
        }
      }

      const resizerResult = await ImageResizer.createResizedImage(
        imageUri,
        3000,
        3000,
        'JPEG',
        100,
        360 - rotation,
        null,
        false
      );

      finalUri = resizerResult.uri;
      finalWidth = resizerResult.width;
      finalHeight = resizerResult.height;

      console.log(`Готово. Размеры: ${finalWidth}x${finalHeight}. URI: ${finalUri}`);

      const apiPromise = detectCorners(finalUri, finalWidth, finalHeight);

      let cornersResult;
      try {
        cornersResult = await Promise.race([
            apiPromise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Превышено время ожидания')), 10000)
            )
        ]);
      } catch (error) {
        setIsFlashVisible(false);
        Alert.alert('Ошибка', error.message || 'Превышено время ожидания');
        return;
      }

      setIsFlashVisible(false);

      navigation.navigate('Preview', { 
        imageUri: finalUri,
        corners: cornersResult.corners,
        imageWidth: finalWidth,
        imageHeight: finalHeight
      });

    } catch (e) {
      console.error('Ошибка:', e);
      setIsFlashVisible(false);
      Alert.alert('Ошибка распознавания', e.message || 'Не удалось найти документ');
    }
  };

  if (device == null || !hasPermission) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{color: 'white'}}>Загрузка...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!isFlashVisible}
        photo={true}
      />

      {isFlashVisible && <View style={styles.flashOverlay} />}

      {!isFlashVisible && (
        <TouchableOpacity 
          style={styles.settingsButton} 
          onPress={() => setSettingsVisible(true)}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      )}

      {!isFlashVisible && (
        <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>
      )}

      <Modal
        visible={settingsVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.glassModalContent}>
            
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>Настройки</Text>
            
            <View style={styles.settingRow}>
              <Text style={styles.settingText}>Автодетекция поворота</Text>
              <Switch
                value={autoRotate}
                onValueChange={setAutoRotate}
                trackColor={{ false: "#555", true: "#81b0ff" }}
                thumbColor={autoRotate ? "#007AFF" : "#f4f3f4"}
              />
            </View>
            <Text style={styles.settingHint}>
              Если включено, приложение попытается автоматически повернуть документ в портретную ориентацию перед распознаванием.
            </Text>

            <TouchableOpacity 
              style={styles.glassButton} 
              onPress={() => setSettingsVisible(false)}
            >
              <Text style={styles.glassButtonText}>Готово</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: 'black'
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: 'black' 
  },
  
  settingsButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    overflow: 'hidden',
  },
  settingsIcon: {
    fontSize: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  captureButton: { 
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    width: 70, 
    height: 70, 
    borderRadius: 35, 
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 4,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center'
  },
  captureButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'white',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },

  flashOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: 'white', 
    zIndex: 10 
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  
  glassModalContent: {
    width: '100%',
    backgroundColor: Platform.OS === 'ios' ? 'rgba(28, 28, 30, 0.85)' : 'rgba(28, 28, 30, 0.95)',
    borderRadius: 24,
    padding: 20,
    paddingBottom: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 20,
  },
  
  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2.5,
    marginBottom: 15,
  },

  modalTitle: {
    fontSize: 20, 
    fontWeight: 'bold', 
    color: 'white', 
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
  },
  settingText: {
    color: 'white', 
    fontSize: 16, 
    flex: 1,
  },
  settingHint: {
    color: '#AAA', 
    fontSize: 12, 
    width: '100%', 
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  
  glassButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    width: '100%',
    alignItems: 'center',
    marginTop: 10,
  },
  glassButtonText: {
    color: 'white', 
    fontSize: 16, 
    fontWeight: '600',
  },
});

export default CameraScreen;