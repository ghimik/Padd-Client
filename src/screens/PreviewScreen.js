import React, { useState, useRef } from 'react';
import { View, Image, StyleSheet, Text, Dimensions, PanResponder, ActivityIndicator, TouchableOpacity } from 'react-native';
import Svg, { Polygon, Circle, Defs, Filter, FeGaussianBlur, FeComposite } from 'react-native-svg';
import { warpPerspective } from '../api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const DraggableCorner = ({ index, point, onMove }) => {
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        onMove(index, gestureState.moveX, gestureState.moveY);
      },
    })
  ).current;

  return (
    <View
      style={[
        styles.draggableCorner,
        {
          left: point.x - 28, // Увеличили зону захвата и центрировали
          top: point.y - 28,
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Внутренний шарик для визуала */}
      <View style={styles.cornerInner} />
    </View>
  );
};

const PreviewScreen = ({ route, navigation }) => {
    const imageWidth = route.params?.imageWidth;
    const imageHeight = route.params?.imageHeight;

    const imageAspect = imageWidth / imageHeight;
    const screenAspect = SCREEN_WIDTH / SCREEN_HEIGHT;

    let displayWidth;
    let displayHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (imageAspect > screenAspect) {
        displayWidth = SCREEN_WIDTH;
        displayHeight = SCREEN_WIDTH / imageAspect;
        offsetY = (SCREEN_HEIGHT - displayHeight) / 2;
    } else {
        displayHeight = SCREEN_HEIGHT;
        displayWidth = SCREEN_HEIGHT * imageAspect;
        offsetX = (SCREEN_WIDTH - displayWidth) / 2;
    }
    
  const defaultCorners = [
    { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }
  ];
  
  const [cornersState, setCornersState] = useState(route.params?.corners || defaultCorners);
    const cornersRef = useRef(cornersState);

    const updateCorner = (index, screenX, screenY) => {
    const newX = (screenX - offsetX) / displayWidth;
    const newY = (screenY - offsetY) / displayHeight;

    setCornersState(prev => {
        const next = [...prev];
        next[index] = { x: newX, y: newY };
        cornersRef.current = next;
        return next;
    });
    };


  const convertToPixels = (corner) => {
    return {
        x: offsetX + corner.x * displayWidth,
        y: offsetY + corner.y * displayHeight
    };
    };

  const p1 = convertToPixels(cornersState[0]);
  const p2 = convertToPixels(cornersState[1]);
  const p3 = convertToPixels(cornersState[2]);
  const p4 = convertToPixels(cornersState[3]);

  const swipeResponder = useRef(
    PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
            Math.abs(g.dy) > 30 &&
            Math.abs(g.dy) > Math.abs(g.dx) &&
            Math.abs(g.moveY - g.y0) > 40,

        onPanResponderRelease: (_, g) => {
            if (g.dy < -80) console.log("SWIPE UP");
            else if (g.dy > 80) handleSwipeDown();
        }
    
    })
    ).current;

    const [loading, setLoading] = useState(false);


    const handleSwipeDown = async () => {
        try {
            setLoading(true);
            console.log('Warping with corners (actual ref):', cornersRef.current);

            const warpedUri = await warpPerspective(
                route.params.imageUri,
                cornersRef.current,
                imageWidth,
                imageHeight
            );

            navigation.navigate('WarpedPreviewScreen', { warpedImageUri: warpedUri });
        } catch (e) {
            console.error('Warp failed', e);
        } finally {
            setLoading(false);
        }
    };

  return (
    <View style={styles.container} {...swipeResponder.panHandlers}>
        {loading && (
            <View style={styles.loadingOverlay}>
                <View style={styles.glassCard}>
                    <ActivityIndicator size="large" color="#00E5FF" />
                    <Text style={styles.loadingText}>Обработка...</Text>
                </View>
            </View>
        )}

        {/* Верхняя подсказка (Glass Pill) */}
        <View style={styles.topHintContainer}>
            <Text style={styles.text}>Тяните углы для коррекции</Text>
        </View>
      
        <Image 
            source={{ uri: route.params?.imageUri }} 
            style={styles.image} 
            resizeMode="contain"
        />

        {/* SVG Layer for Glass Effect Polygon */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Определяем фильтр размытия для тени, если нужно */}
            <Defs>
                <Filter id="glow">
                    <FeGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <FeComposite in="SourceGraphic" in2="coloredBlur" operator="over"/>
                </Filter>
            </Defs>
            
            {/* Сама область документа (Glass Polygon) */}
            <Polygon
                points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
                fill="rgba(255, 255, 255, 0.15)" // Полупрозрачное стекло
                stroke="rgba(0, 229, 255, 0.8)" // Голубая неоновая обводка
                strokeWidth="2.5"
                strokeDasharray="0" // Сплошная линия
                filter="url(#glow)" // Применяем свечение
            />
            
            {/* Точки углов (визуальная часть SVG, поверх всего) */}
            {[p1, p2, p3, p4].map((point, index) => (
                <Circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r={10}
                    fill="rgba(255, 255, 255, 0.6)" // Полупрозрачный центр
                    stroke="white"
                    strokeWidth="2"
                />
            ))}
        </Svg>

        {/* Drag Handles (прозрачные области для пальца) */}
        {[p1, p2, p3, p4].map((point, index) => (
            <DraggableCorner
                key={index}
                index={index}
                point={point}
                onMove={updateCorner}
            />
        ))}

        {/* Кнопка "Назад" (Glass Button) */}
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    position: 'absolute'
  },
  
  // --- Glass UI Elements ---
  
  // Верхняя подсказка
  topHintContainer: {
    position: 'absolute',
    top: 60,
    zIndex: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 10,
    paddingHorizontal: 25,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  text: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Угловой маркер (Drag Handle)
  draggableCorner: {
    position: 'absolute',
    width: 56, // Большая зона касания
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent', // Сам вью прозрачный, внутри картинка
  },
  cornerInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.4)', // Матовый шарик
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#00E5FF', // Голубое свечение
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 10,
  },

  // Кнопка назад
  backButton: {
    position: 'absolute',
    bottom: 40,
    left: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  backButtonText: {
    color: 'white',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2, // Центрирование стрелки
  },

  // Загрузка
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 100
  },
  glassCard: {
    backgroundColor: 'rgba(40, 40, 50, 0.6)',
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
  loadingText: {
      color: 'white',
      marginTop: 15,
      fontSize: 16,
      fontWeight: '500'
  }
});

export default PreviewScreen;