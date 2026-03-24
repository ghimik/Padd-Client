import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  PanResponder,
  ActivityIndicator,
  Text,
  Linking,
  Share,
  Alert,
  PermissionsAndroid,
  Platform,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch
} from 'react-native';
import Toast from 'react-native-toast-message';
import { doOCR, API_URL, enhanceDocument } from '../api';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import Icon from 'react-native-vector-icons/MaterialIcons';
import RNFS from 'react-native-fs';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PAPER_SIZES = {
  A4: { width: 2480, height: 3508, name: 'A4' },
  LETTER: { width: 2550, height: 3300, name: 'Letter' },
};

const WarpedPreviewScreen = ({ route, navigation }) => {
  const { warpedImageUri } = route.params;
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showScaleMenu, setShowScaleMenu] = useState(false);
  const [showEnhanceMenu, setShowEnhanceMenu] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [customWidth, setCustomWidth] = useState('2480');
  const [customHeight, setCustomHeight] = useState('3508');
  const [previewUri, setPreviewUri] = useState(warpedImageUri);
  const [originalUri, setOriginalUri] = useState(warpedImageUri);
  
  const [enhanceEnabled, setEnhanceEnabled] = useState(false);
  const [enhanceBrightness, setEnhanceBrightness] = useState('1.15');
  const [enhanceContrast, setEnhanceContrast] = useState('1.2');
  const [enhanceWhitening, setEnhanceWhitening] = useState('0.85');
  const [enhanceShadowRemoval, setEnhanceShadowRemoval] = useState(true);
  const [enhanceSharpen, setEnhanceSharpen] = useState(true);
  
  const scaledImageRef = useRef(null);
  
  const [tempCustomWidth, setTempCustomWidth] = useState('2480');
  const [tempCustomHeight, setTempCustomHeight] = useState('3508');

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 50) {
          handleSaveWithoutOCR();
        } else if (gestureState.dy < -50) {
          handleStartOCR();
        }
      }
    })
  ).current;

  const requestAndroidPermission = async () => {
    try {
      if (Platform.Version < 29) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          {
            title: 'Доступ к галерее',
            message: 'Приложению нужен доступ для сохранения фото',
            buttonNeutral: 'Спросить позже',
            buttonNegative: 'Отмена',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    } catch (err) {
      console.warn(err);
      return false;
    }
  };

  const applyEnhancement = async () => {
    if (!enhanceEnabled) {
      setPreviewUri(originalUri);
      scaledImageRef.current = null;
      Toast.show({
        type: 'info',
        text1: 'Улучшение отключено',
        text2: 'Показан оригинальный документ'
      });
      return;
    }
    
    try {
      setIsProcessing(true);
      Toast.show({
        type: 'info',
        text1: 'Улучшение качества',
        text2: 'Повышаем контраст, убираем тени...',
        autoHide: false,
      });
      
      const enhancedUri = await enhanceDocument(originalUri, {
        brightness: parseFloat(enhanceBrightness),
        contrast: parseFloat(enhanceContrast),
        whitening: parseFloat(enhanceWhitening),
        shadow_removal: enhanceShadowRemoval,
        sharpen: enhanceSharpen
      });
      
      setPreviewUri(enhancedUri);
      scaledImageRef.current = enhancedUri;
      
      Toast.hide();
      Toast.show({
        type: 'success',
        text1: 'Улучшение применено',
        text2: 'Документ стал контрастнее и чище'
      });
      
    } catch (error) {
      console.error('Enhance error:', error);
      Toast.hide();
      Toast.show({
        type: 'error',
        text1: 'Ошибка',
        text2: 'Не удалось улучшить изображение'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const resizeImage = async (width, height) => {
    try {
      setIsProcessing(true);
      console.log(`Stretch via server ${width}x${height}`);

      const form = new FormData();
      form.append('file', {
        uri: previewUri,
        name: 'image.jpg',
        type: 'image/jpeg',
      });

      form.append('target_width', width);
      form.append('target_height', height);

      const response = await fetch(`${API_URL}/stretch_to_aspect`, {
        method: 'POST',
        body: form,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) throw new Error('Server error');

      const blob = await response.blob();
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });

      const fileName = `scaled_${width}x${height}_${Date.now()}.jpg`;
      const permanentPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
      await RNFS.writeFile(permanentPath, base64, 'base64');

      const uri = `file://${permanentPath}`;
      scaledImageRef.current = uri;
      setPreviewUri(uri);
      
      return uri;

    } catch (error) {
      console.error('Ошибка stretch:', error);
      Alert.alert('Ошибка', 'Не удалось изменить размер изображения');
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  const applyScaling = async (format) => {
    let width, height, formatName;
    
    if (format === 'CUSTOM') {
      width = parseInt(tempCustomWidth);
      height = parseInt(tempCustomHeight);
      formatName = `Custom ${width}x${height}`;
      
      if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
        Alert.alert('Ошибка', 'Введите корректные размеры');
        return;
      }
    } else {
      const size = PAPER_SIZES[format];
      width = size.width;
      height = size.height;
      formatName = size.name;
    }
    
    const newUri = await resizeImage(width, height);
    
    if (newUri) {
      setSelectedFormat(formatName);
      setCustomWidth(width.toString());
      setCustomHeight(height.toString());
    }
    
    setShowScaleMenu(false);
  };

  const handleSaveWithoutOCR = async () => {
    try {
      if (Platform.OS === 'android') {
        const hasPermission = await requestAndroidPermission();
        if (!hasPermission) {
          Alert.alert('Ошибка', 'Нужно разрешение на доступ к галерее');
          return;
        }
      }

      let uriToSave = previewUri;

      if (uriToSave.startsWith('file://')) {
        const fileExists = await RNFS.exists(uriToSave.replace('file://', ''));
        if (!fileExists) {
            uriToSave = originalUri;
            Toast.show({
                type: 'error',
                text1: 'Ошибка кэша',
                text2: 'Файл устарел, сохраняем оригинал'
            });
        }
      }

      await CameraRoll.save(uriToSave, { type: 'photo' });

      navigation.navigate('Camera');
      Toast.show({
        type: 'success',
        text1: 'Сохранено',
        text2: scaledImageRef.current ? `Изображение ${selectedFormat ? `(${selectedFormat})` : 'улучшено'}` : 'Фото добавлено в галерею'
      });

    } catch (error) {
      console.error('Ошибка сохранения:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить фото: ' + error.message);
    }
  };

  const handleStartOCR = async () => {
    navigation.navigate('Camera');
    Toast.show({
      type: 'info',
      text1: 'Обработка...',
      text2: 'Распознаем текст документа',
      autoHide: false,
    });
    setIsProcessing(true);

    try {
      const imageForOCR = previewUri;
      const result = await doOCR(imageForOCR);
      
      Toast.hide();
      Toast.show({
        type: 'success',
        text1: 'Документ готов!',
        text2: 'Нажмите, чтобы открыть PDF',
        position: 'top',
        visibilityTime: 6000,
        onPress: () => openFile(result.pdfUri),
      });
      
    } catch (error) {
      Toast.hide();
      Toast.show({
        type: 'error',
        text1: 'Ошибка OCR',
        text2: error.message || 'Не удалось распознать текст'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const openFile = async (uri) => {
    try {
      const supported = await Linking.canOpenURL(uri);
      if (supported) {
        await Linking.openURL(uri);
      } else {
        await Share.share({ url: uri, title: 'Документ PDF' });
      }
    } catch (err) {
      Alert.alert('Ошибка', 'Не удалось открыть файл');
    }
  };

  const EnhanceMenu = () => (
    <Modal
      visible={showEnhanceMenu}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowEnhanceMenu(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />

          <Text style={styles.modalTitle}>Улучшение качества</Text>
          
          <View style={styles.settingRow}>
            <Text style={styles.settingText}>Включить улучшение</Text>
            <Switch
              value={enhanceEnabled}
              onValueChange={setEnhanceEnabled}
              trackColor={{ false: '#444', true: '#00E5FF' }}
              thumbColor={enhanceEnabled ? '#fff' : '#f4f3f4'}
            />
          </View>
          
          {enhanceEnabled && (
            <>
              <View style={styles.divider} />
              
              <View style={styles.settingRow}>
                <Text style={styles.settingText}>Яркость</Text>
                <TextInput
                  style={styles.smallInput}
                  value={enhanceBrightness}
                  onChangeText={setEnhanceBrightness}
                  keyboardType="numeric"
                />
              </View>
              
              {/* Контраст */}
              <View style={styles.settingRow}>
                <Text style={styles.settingText}>Контраст</Text>
                <TextInput
                  style={styles.smallInput}
                  value={enhanceContrast}
                  onChangeText={setEnhanceContrast}
                  keyboardType="numeric"
                />
              </View>
              
              <View style={styles.settingRow}>
                <Text style={styles.settingText}>Отбеливание фона</Text>
                <TextInput
                  style={styles.smallInput}
                  value={enhanceWhitening}
                  onChangeText={setEnhanceWhitening}
                  keyboardType="numeric"
                />
              </View>
              
              <View style={styles.settingRow}>
                <Text style={styles.settingText}>Удаление теней</Text>
                <Switch
                  value={enhanceShadowRemoval}
                  onValueChange={setEnhanceShadowRemoval}
                  trackColor={{ false: '#444', true: '#00E5FF' }}
                />
              </View>
              
              {/* Резкость */}
              <View style={styles.settingRow}>
                <Text style={styles.settingText}>Повысить резкость</Text>
                <Switch
                  value={enhanceSharpen}
                  onValueChange={setEnhanceSharpen}
                  trackColor={{ false: '#444', true: '#00E5FF' }}
                />
              </View>
            </>
          )}
          
          <TouchableOpacity 
            style={styles.glassButtonAccent}
            onPress={() => {
              applyEnhancement();
              setShowEnhanceMenu(false);
            }}
          >
            <Text style={styles.glassButtonText}>Применить улучшение</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => setShowEnhanceMenu(false)}
          >
            <Text style={styles.closeButtonText}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const ScalingMenu = () => (
    <Modal
      visible={showScaleMenu}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowScaleMenu(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />

          <Text style={styles.modalTitle}>Масштабирование</Text>
          
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => applyScaling('A4')}
          >
            <Text style={styles.menuItemText}>📄 A4 (2480x3508)</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => applyScaling('LETTER')}
          >
            <Text style={styles.menuItemText}>📄 Letter (2550x3300)</Text>
          </TouchableOpacity>
          
          <View style={styles.customInputContainer}>
            <Text style={styles.customInputLabel}>Кастомный размер:</Text>
            <View style={styles.customInputRow}>
              <TextInput
                style={styles.customInput}
                value={tempCustomWidth}
                onChangeText={setTempCustomWidth}
                keyboardType="numeric"
                placeholder="Ширина"
                placeholderTextColor="#888"
              />
              <Text style={styles.customInputX}>x</Text>
              <TextInput
                style={styles.customInput}
                value={tempCustomHeight}
                onChangeText={setTempCustomHeight}
                keyboardType="numeric"
                placeholder="Высота"
                placeholderTextColor="#888"
              />
            </View>
            <TouchableOpacity 
              style={styles.glassButtonAccent}
              onPress={() => applyScaling('CUSTOM')}
            >
              <Text style={styles.glassButtonText}>Применить</Text>
            </TouchableOpacity>
          </View>
          
          {selectedFormat && (
            <TouchableOpacity 
              style={styles.resetButton}
              onPress={() => {
                setPreviewUri(originalUri);
                scaledImageRef.current = null;
                setSelectedFormat(null);
                setShowScaleMenu(false);
              }}
            >
              <Text style={styles.resetButtonText}>↺ Сбросить к оригиналу</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => setShowScaleMenu(false)}
          >
            <Text style={styles.closeButtonText}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Image 
        source={{ uri: previewUri }} 
        style={styles.image} 
        resizeMode="contain"
      />
      
      <TouchableOpacity 
        style={[styles.scaleButton, { top: 100 }]}
        onPress={() => setShowEnhanceMenu(true)}
      >
        <Icon name="tune" size={26} color="white" />
        {enhanceEnabled && (
          <View style={styles.formatBadge}>
            <Text style={styles.formatBadgeText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.scaleButton, { top: 160 }]}
        onPress={() => {
          setTempCustomWidth(customWidth);
          setTempCustomHeight(customHeight);
          setShowScaleMenu(true);
        }}
      >
        <Icon name="aspect-ratio" size={26} color="white" />
        {selectedFormat && (
          <View style={styles.formatBadge}>
            <Text style={styles.formatBadgeText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
      
      {enhanceEnabled && (
        <View style={[styles.formatInfo, { top: 218 }]}>
          <Text style={styles.formatInfoText}>✨ Улучшено</Text>
        </View>
      )}
      
      {selectedFormat && (
        <View style={[styles.formatInfo, { top: enhanceEnabled ? 260 : 218 }]}>
          <Text style={styles.formatInfoText}>{selectedFormat}</Text>
        </View>
      )}
      
      <View style={styles.hintContainerTop}>
        <Text style={styles.hintText}>Свайп вверх — распознать текст</Text>
      </View>
      
      <View style={styles.hintContainerBottom}>
        <Text style={styles.hintText}>Свайп вниз — сохранить фото</Text>
      </View>

      {isProcessing && (
        <View style={styles.loaderContainer}>
          <View style={styles.glassCard}>
            <ActivityIndicator size="large" color="#00E5FF" />
            <Text style={styles.loaderText}>Обработка...</Text>
          </View>
        </View>
      )}
      
      <EnhanceMenu />
      <ScalingMenu />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: 'black', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  image: { 
    width: SCREEN_WIDTH, 
    height: SCREEN_HEIGHT, 
    position: 'absolute' 
  },

  scaleButton: {
    position: 'absolute',
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
    zIndex: 1000,
  },
  
  formatBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#00E5FF',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)'
  },
  formatBadgeText: {
    color: 'black',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  formatInfo: {
    position: 'absolute',
    right: 20,
    backgroundColor: 'rgba(0, 229, 255, 0.2)',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.4)',
  },
  formatInfoText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: 'bold',
  },

  hintContainerTop: {
    position: 'absolute',
    top: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  hintContainerBottom: {
    position: 'absolute',
    bottom: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  hintText: {
    color: 'white',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  loaderContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  glassCard: {
    backgroundColor: 'rgba(28, 28, 30, 0.8)',
    padding: 30,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  loaderText: {
    color: 'white',
    marginTop: 15,
    fontSize: 16,
    fontWeight: '500'
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomWidth: 0,
  },
  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2.5,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
    textAlign: 'center',
  },
  
  menuItem: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  menuItemText: {
    fontSize: 18,
    color: 'white',
  },
  
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingText: {
    fontSize: 16,
    color: 'white',
  },
  smallInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 8,
    width: 60,
    textAlign: 'center',
    color: 'white',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 12,
  },
  
  customInputContainer: {
    marginVertical: 20,
  },
  customInputLabel: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 10,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: 'white',
  },
  customInputX: {
    marginHorizontal: 15,
    fontSize: 18,
    color: '#888',
  },
  
  glassButtonAccent: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderRadius: 12,
    padding: 14,
    marginTop: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  glassButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  
  resetButton: {
    backgroundColor: 'rgba(255, 159, 10, 0.8)',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  resetButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  closeButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default WarpedPreviewScreen;