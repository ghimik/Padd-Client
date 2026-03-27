import RNFS from 'react-native-fs';

export const API_URL = 'http://10.0.2.2:8041'; 

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchWithRetry = async (url, options, attempts = 3) => {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await delay(300);
      }
    }
  }
  throw lastError;
};

export const enhanceDocument = async (imageUri, options = {}) => {
  console.log('API: Улучшение документа для', imageUri);
  
  const {
    brightness = 1.15,
    contrast = 1.2,
    whitening = 0.85,
    shadow_removal = true,
    sharpen = true
  } = options;

  try {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    });
    formData.append('brightness', String(brightness));
    formData.append('contrast', String(contrast));
    formData.append('whitening', String(whitening));
    formData.append('shadow_removal', String(shadow_removal));
    formData.append('sharpen', String(sharpen));

    const response = await fetchWithRetry(`${API_URL}/enhance_document`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server Error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64Data = btoa(binary);

    const path = `${RNFS.CachesDirectoryPath}/enhanced_${Date.now()}.jpg`;
    await RNFS.writeFile(path, base64Data, 'base64');

    console.log('API: Улучшенное фото сохранено по пути', path);
    
    return 'file://' + path;

  } catch (error) {
    console.error('API Enhancement Error:', error);
    throw error;
  }
};

export const detectCorners = async (imageUri, imageWidth, imageHeight) => {
  const makeFile = () => ({
    uri: imageUri,
    type: 'image/jpeg',
    name: 'photo.jpg'
  });

  const res1 = await fetchWithRetry(`${API_URL}/find_corners_and_bbox`, {
    method: 'POST',
    body: (() => {
      const f = new FormData();
      f.append('file', makeFile());
      return f;
    })()
  });

  if (!res1.ok) {
    const err = await res1.json().catch(() => ({}));
    throw new Error(err.detail || `Server Error: ${res1.status}`);
  }

  const first = await res1.json();

  const res2 = await fetchWithRetry(`${API_URL}/refine_corners`, {
    method: 'POST',
    body: (() => {
      const f = new FormData();
      f.append('file', makeFile());
      f.append('corners', JSON.stringify(first.corners));
      f.append('bbox', JSON.stringify(first.bbox));
      return f;
    })()
  });

  if (!res2.ok) {
    const err = await res2.json().catch(() => ({}));
    throw new Error(err.detail || `Server Error: ${res2.status}`);
  }

  const refined = await res2.json();
  const order = ['TL', 'TR', 'BR', 'BL'];

  const corners = order.map(k => ({
    x: refined.refined_corners[k][0] / imageWidth,
    y: refined.refined_corners[k][1] / imageHeight
  }));

  return {
    corners,
    detector: first.detector,
    bbox: first.bbox
  };
};

export const warpPerspective = async (imageUri, corners, imageWidth, imageHeight) => {
  const makeFile = () => ({ uri: imageUri, type: 'image/jpeg', name: 'photo.jpg' });

  const formData = new FormData();
  formData.append('file', makeFile());
  formData.append('corners', JSON.stringify({
    TL: [corners[0].x * imageWidth, corners[0].y * imageHeight],
    TR: [corners[1].x * imageWidth, corners[1].y * imageHeight],
    BR: [corners[2].x * imageWidth, corners[2].y * imageHeight],
    BL: [corners[3].x * imageWidth, corners[3].y * imageHeight],
  }));

  const res = await fetchWithRetry(`${API_URL}/warp_perspective`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Warp failed: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  const base64Data = btoa(binary);

  const path = `${RNFS.CachesDirectoryPath}/warped_${Date.now()}.jpg`;
  await RNFS.writeFile(path, base64Data, 'base64');

  return 'file://' + path;
};


export const doOCR = async (imageUri) => {
  console.log('API: Запуск OCR для', imageUri);
  
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    });

    const response = await fetchWithRetry(`${API_URL}/do_ocr`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'OCR Server Error' }));
      throw new Error(errorData.detail || `Server Error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);

    const fileName = `document_${Date.now()}.pdf`;
    const path = `${RNFS.CachesDirectoryPath}/${fileName}`;

    await RNFS.writeFile(path, base64Data, 'base64');

    console.log('API: PDF сохранен по пути', path);

    return {
      pdfUri: 'file://' + path,
      fileName: fileName
    };

  } catch (error) {
    console.error('API OCR Error:', error);
    throw error;
  }
};

export const getRotationAngle = async (imageUri) => {
  console.log('API: Определение угла поворота для', imageUri);
  
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    });

    const response = await fetchWithRetry(`${API_URL}/define_rotation_angle`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server Error: ${response.status}`);
    }

    const result = await response.json();
    console.log('API: Угол поворота:', result.angle, 'Score:', result.score);
    
    return {
      angle: result.angle,
      score: result.score
    };

  } catch (error) {
    console.error('API Rotation Error:', error);
    throw error;
  }
};
